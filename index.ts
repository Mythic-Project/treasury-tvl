import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { WRAPPED_SOL, getTreasuryId, isSelf, lsts, programIds, stables } from "./utils";
import { Governance, JupiterPriceResult, Realm, RealmWithTreasur, RealmWithTreasury, Treasury, TreasuryWithSol, UniqueToken } from "./types";
import * as fs from "fs";
import bs58 from "bs58";
import axios from "axios";
import {SplGovernance} from "governance-idl-sdk";

const endpoint = 'RPC_ENDPOINT_HERE'
const connection = new Connection(endpoint)
const splGovernance = new SplGovernance(connection)

async function fetchAndStoreRealms() {
  const realms: Realm[] = []

  for (const programId of programIds) {
    const realmsV2 = await connection.getProgramAccounts(new PublicKey(programId), {
      filters: [{
        memcmp: {
          offset: 0,
          bytes: 'H'
        }
      }],
      dataSlice: {
        length: 0,
        offset: 0
      }
    })

    realms.push(...realmsV2.map(r => ({
      realmId: r.pubkey.toBase58(),
      programId,
      self: isSelf(programId)
    })))

    const realmsV1 = await connection.getProgramAccounts(new PublicKey(programId), {
      filters: [{
        memcmp: {
          offset: 0,
          bytes: '2'
        }
      }],
      dataSlice: {
        length: 0,
        offset: 0
      }
    })

    realms.push(...realmsV1.map(r => ({
      realmId: r.pubkey.toBase58(),
      programId,
      self: isSelf(programId)
    })))
  }

  fs.writeFileSync('./output/realms.json', JSON.stringify(realms));
  console.log("Realms written:", realms.length);
}

async function fetchAndStoreGovernances() {
  const realms: Realm[] = JSON.parse(fs.readFileSync('./output/realms.json', 'utf-8'));
  const governances: Governance[] = JSON.parse(fs.readFileSync('./output/governances.json', 'utf-8'));

  const bytes = ['4', '5', 'K', 'L', 'M', 'N']

  for (const programId of programIds) {
    for (const byte of bytes) {
      const govs = await connection.getProgramAccounts(new PublicKey(programId), {
        filters: [{
          memcmp: {
            offset: 0,
            bytes: byte
          }
        }],
        dataSlice: {
          length: 33,
          offset: 0
        }
      })

      const updatedGovs: Governance[] = govs.map(t => {
        const realmAddress = bs58.encode(t.account.data.slice(1,33))
        const realm = realms.find(r => r.realmId === realmAddress)!

        return {
          govId: t.pubkey.toBase58(),
          treasuryId: getTreasuryId(t.pubkey.toBase58(), programId),
          ...realm
        }
      })

      governances.push(...updatedGovs)
    }

    fs.writeFileSync('./output/governances.json', JSON.stringify(governances));
    console.log("Governances written from program id:", programId);
  }
}

async function fetchAssetsForTreasuries() {
  const governances: Governance[] = JSON.parse(fs.readFileSync('./output/governances.json', 'utf-8'));
  const treasuryIds = governances.map(g => g.treasuryId);
  const treasuries: Treasury[] = []

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

    const treasury: Treasury = {
      tokens,
      address: treasuryId
    }

    treasuries.push(treasury)
    fs.writeFileSync('./output/treasuries.json', JSON.stringify(treasuries));
    console.log("Treasury fetched for treasury Id: ", treasuryId, 'at index: ', index);
    index++
  }
}

function getUniqueTokens() {
  const treasuries: Treasury[] = JSON.parse(fs.readFileSync('./output/treasuries.json', 'utf-8'));
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

  fs.writeFileSync('./output/prices.json', JSON.stringify(uniqueTokens));
}

async function fetchPrices() {
  const uniqueTokens: UniqueToken[] = JSON.parse(fs.readFileSync('./output/prices.json', 'utf-8'));
  const tokenIds = uniqueTokens.map(t => t.tokenId);

  let s = 0
  let e = tokenIds.length

  for (let i = s; i < e; i+= 100) {
    const prices = await axios.get(
      `https://lite-api.jup.ag/price/v2?ids=${tokenIds.slice(i, i+100).join()}`
    )
    const priceResults: JupiterPriceResult[] = Object.values(prices.data.data)
    
    for (const price of priceResults) {
      if (price) {
        const index = uniqueTokens.findIndex(t => t.tokenId === price.id)
        uniqueTokens[index].price = parseFloat(price.price)
      }
    }

    fs.writeFileSync('./output/prices.json', JSON.stringify(uniqueTokens));
    console.log("Prices written for index starting from: ", i)
  }
}

async function fetchSolForTreasuries() {
  const treasuries: Treasury[] = JSON.parse(fs.readFileSync('./output/treasuries.json', 'utf-8'));
  const treasuriesWithSol: TreasuryWithSol[] = treasuries.map(t => ({sol: 0, ...t}))

  for (let i=0; i<treasuriesWithSol.length; i++) {
    const balance = await connection.getBalance(
      new PublicKey(treasuriesWithSol[i].address)
    )
    
    treasuriesWithSol[i].sol = balance / LAMPORTS_PER_SOL

    fs.writeFileSync('./output/treasuries.json', JSON.stringify(treasuriesWithSol));
    console.log("SOL fetched for treasury Id: ", treasuriesWithSol[i].address, 'at index: ', i);
  }
}

function calculateFinalTvl() {
  const solPrice = 213;
  const realms: Realm[] = JSON.parse(fs.readFileSync('./output/realms.json', 'utf-8'));
  const governances: Governance[] = JSON.parse(fs.readFileSync('./output/governances.json', 'utf-8'));
  const treasuries: TreasuryWithSol[] = JSON.parse(fs.readFileSync('./output/treasuries.json', 'utf-8'));
  const prices: UniqueToken[] = JSON.parse(fs.readFileSync('./output/prices.json', 'utf-8'));

  const finalTvls: RealmWithTreasur[] = []

  for (const realm of realms) {
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
  }

  fs.writeFileSync('./output/final.json', JSON.stringify(finalTvls));
}

function miscCalc() {
  const finalTvls: RealmWithTreasury[] = JSON.parse(fs.readFileSync('./output/final.json', 'utf-8'));

  const tvl = finalTvls.reduce((a,b) => a+b.tvl,0)
  console.log(tvl)
}

async function fetchRealmNames() {
  const finalTvls: RealmWithTreasur[] = JSON.parse(fs.readFileSync('./output/final.json', 'utf-8'));
  const updatedFinalTvls: RealmWithTreasury[] = finalTvls.map(t => ({...t, name: ""})) 

  for (let i=0; i<updatedFinalTvls.length;i++) {
    let name = ""
    try {
      const realm = await splGovernance.getRealmByPubkey(new PublicKey(updatedFinalTvls[i].realmId))
      name = realm.name
    } catch {
      const realm = await splGovernance.getRealmV1ByPubkey(new PublicKey(updatedFinalTvls[i].realmId))
      name = realm.name
    }
    updatedFinalTvls[i].name = name
    
    fs.writeFileSync('./output/final.json', JSON.stringify(updatedFinalTvls));
    console.log("Name fetched for realm Id: ", updatedFinalTvls[i].realmId, 'at index: ', i);
  }
}

(async() => {
  await fetchAndStoreRealms()
  // await fetchAndStoreGovernances()
  // await fetchAssetsForTreasuries()
  // getUniqueTokens()
  // await fetchPrices()
  // await fetchSolForTreasuries()
  // calculateFinalTvl()
  // miscCalc()
  // await fetchRealmNames()
})()