
export type Realm = {
  realmId: string,
  programId: string,
  self: boolean
}

export type Governance = {
  govId: string,
  treasuryId: string,
  realmId: string,
  programId: string,
  self: boolean
}

type Token = {
  tokenId: string,
  amount: number
}

export type Treasury = {
  address: string,
  tokens: Token[]
}

export type TreasuryWithSol = {
  address: string,
  sol: number,
  tokens: Token[]
}


export type UniqueToken = {
  tokenId: string,
  price: number
}

export type JupiterPriceResult = {
  id: string,
  price: string
}

export type RealmWithTreasur = {
  realmId: string,
  programId: string,
  govIds: string[],
  treasuryIds: string[],
  self: boolean,
  tvl: number,
  solTvl: number,
  stableTvl: number,
  lstTvl: number
}

export type RealmWithTreasury = {
  name: string,
  realmId: string,
  programId: string,
  govIds: string[],
  treasuryIds: string[],
  self: boolean,
  tvl: number,
  solTvl: number,
  stableTvl: number,
  lstTvl: number
}

export type Comment = {
  author: string,
  address: string,
  balance: number
}

export type Proposal = {
  publicKey: string,
  tor: string,
  balance: number,
  self: boolean
}

export type Vote = {
  publicKey: string,
  proposal: string,
  voter: string,
  balance: number,
  self: boolean
}