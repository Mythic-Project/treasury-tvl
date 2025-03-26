import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { WRAPPED_SOL, getTreasuryId, lsts, stables } from "./utils";
import { Governance, JupiterPriceResult, Realm, RealmWithTreasur, TreasuryWithSol, UniqueToken } from "./types";
import * as fs from "fs";
import axios from "axios";

const endpoint = 'RPC_ENDPOINT';
const connection = new Connection(endpoint);

const realm: Realm = {
  realmId: "REALM_ID",
  programId: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
  self: false
};

(async() => {
  // Fetch Governances for the Realm
  await fetchAndStoreGovernances()
  // Fetch Treasuries for the Governances
  await fetchAssetsForTreasuries()
  // Get all unique tokens
  getUniqueTokens()
  // Fetch Prices for the tokens
  await fetchPrices()
  // Calculate final TVL
  calculateFinalTvl()
})()

async function fetchAndStoreGovernances() {
  let governances: Governance[] = []

  try {
    governances = JSON.parse(fs.readFileSync('./results/governances.json', 'utf-8')) ?? [];
  } catch {

  }

  const bytes = ['4', '5', 'K', 'L', 'M', 'N']

  for (const byte of bytes) {
    const govs = await connection.getProgramAccounts(new PublicKey(realm.programId), {
      filters: [
        {memcmp: {
          offset: 0,
          bytes: byte
        }},
        {memcmp: {
          offset: 1,
          bytes: realm.realmId
        }}
    ],
      dataSlice: {
        length: 0,
        offset: 0
      }
    })

    const updatedGovs: Governance[] = govs.map(t => {
      return {
        govId: t.pubkey.toBase58(),
        treasuryId: getTreasuryId(t.pubkey.toBase58(), realm.programId),
        ...realm
      }
    })

    governances.push(...updatedGovs)

    fs.writeFileSync('./results/governances.json', JSON.stringify(governances));
    console.log("Governances written from realm:", realm.realmId);
  }
}

async function fetchAssetsForTreasuries() {
  const governances: Governance[] = JSON.parse(fs.readFileSync('./results/governances.json', 'utf-8'));
  const treasuryIds = governances.map(g => g.treasuryId);
  const treasuries: TreasuryWithSol[] = []

  let index = 0

  for (const treasuryId of treasuryIds) {
    const tokenHoldings = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(treasuryId),
      {programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")}
    )
    const tokens = tokenHoldings.value.map(v => ({
      tokenId: v.account.data.parsed.info.mint,
      amount: v.account.data.parsed.info.tokenAmount.uiAmount
    }))

    const balance = await connection.getBalance(
      new PublicKey(treasuryId)
    )

    const treasury: TreasuryWithSol = {
      tokens,
      address: treasuryId,
      sol: balance / LAMPORTS_PER_SOL
    }

    treasuries.push(treasury)
    fs.writeFileSync('./results/treasuries.json', JSON.stringify(treasuries));
    console.log("Treasury fetched for treasury Id: ", treasuryId, 'at index: ', index);
    index++
  }
}

function getUniqueTokens() {
  let treasuries: TreasuryWithSol[] = []
  try {
    treasuries = JSON.parse(fs.readFileSync('./results/treasuries.json', 'utf-8'));
  } catch {}
  const uniqueTokens: UniqueToken[] = []

  for (const treasury of treasuries) {
    for (const token of treasury.tokens) {
      if (uniqueTokens.findIndex(t => t.tokenId === token.tokenId) === -1) {
        uniqueTokens.push({
          tokenId: token.tokenId,
          price: 0
        })
      }
    }
  }

  fs.writeFileSync('./results/prices.json', JSON.stringify(uniqueTokens));
}

async function fetchPrices() {
  const uniqueTokens: UniqueToken[] = JSON.parse(fs.readFileSync('./results/prices.json', 'utf-8'));
  const tokenIds = uniqueTokens.map(t => t.tokenId);

  let s = 0
  let e = tokenIds.length

  for (let i = s; i < e; i+= 100) {
    const prices = await axios.get(
      `https://api.jup.ag/price/v2?ids=${tokenIds.slice(i, i+100).join()}`
    )
    const priceResults: JupiterPriceResult[] = Object.values(prices.data.data)
    
    for (const price of priceResults) {
      if (price) {
        const index = uniqueTokens.findIndex(t => t.tokenId === price.id)
        uniqueTokens[index].price = parseFloat(price.price)
      }
    }

    fs.writeFileSync('./results/prices.json', JSON.stringify(uniqueTokens));
    console.log("Prices written for index starting from: ", i)
  }
}

function calculateFinalTvl() {
  const solPrice = 140;
  const governances: Governance[] = JSON.parse(fs.readFileSync('./results/governances.json', 'utf-8'));
  let treasuries: TreasuryWithSol[] = JSON.parse(fs.readFileSync('./results/treasuries.json', 'utf-8'));
  let prices: UniqueToken[] = JSON.parse(fs.readFileSync('./results/prices.json', 'utf-8'));

  const finalTvls: RealmWithTreasur[] = []

  const govsForRealm = governances.filter(g => g.realmId === realm.realmId)
  const treasuriesForRealm = treasuries.filter(t => govsForRealm.some(g => g.treasuryId === t.address))
  let tvl = 0
  let solTvl = 0
  let stableTvl = 0
  let lstTvl = 0

  for (const treasury of treasuriesForRealm) {
    for (const token of treasury.tokens) {
      const price = prices.find(p => p.tokenId === token.tokenId)!
      const value = token.amount * price.price
      
      tvl += value

      if (stables.includes(token.tokenId)) {
        stableTvl += value
      }

      if (lsts.includes(token.tokenId)) {
        lstTvl += value
      }

      if (token.tokenId === WRAPPED_SOL) {
        solTvl += value
      }
    }

    tvl += treasury.sol * solPrice
    solTvl += treasury.sol * solPrice
  }

  finalTvls.push({
    ...realm,
    solTvl,
    tvl,
    stableTvl,
    lstTvl,
    govIds: govsForRealm.map(g => g.govId),
    treasuryIds: govsForRealm.map(t => t.treasuryId)
  })

  console.log(finalTvls)
  fs.writeFileSync('./results/final.json', JSON.stringify(finalTvls));
}
