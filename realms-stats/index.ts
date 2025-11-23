import { Connection, PublicKey } from "@solana/web3.js"
import { SplGovernance } from "governance-idl-sdk"
import { Comment, Proposal, Vote } from "../types"
import { isSelf, programIds } from "../utils"
import fs from "fs"

const endpoint = 'RPC_ENDPOINT'
const connection = new Connection(endpoint)

async function fetchAllComments() {
  const splGovernance = new SplGovernance(connection)
  const comments: any = await splGovernance.getAllChatMessages()
  const commmentsFormatted: Comment[] = comments.map((comment: any) => ({
    author: comment.author.toBase58(),
    address: comment.publicKey.toBase58(),
    balance: comment.balance
  }))

  const totalMoney = commmentsFormatted.reduce((acc, comment) => acc + comment.balance, 0)
  console.log(comments.length, totalMoney)
  fs.writeFileSync('./realms-stats/output/comments.json', JSON.stringify(commmentsFormatted, null, 2))
}

async function fetchAllProposals() {
  let finalProposals: Proposal[] = []
  let i = 0
  for (const programId of programIds) {
    const splGovernance = new SplGovernance(connection, new PublicKey(programId))
    const proposals: any = await splGovernance.getAllProposals()
    const proposalsFormatted: Proposal[] = proposals.map((proposal: any) => ({
      publicKey: proposal.publicKey.toBase58(),
      tor: proposal.tokenOwnerRecord.toBase58(),
      balance: proposal.balance,
      self: isSelf(programId)
    }))

    finalProposals = [...finalProposals, ...proposalsFormatted]
    fs.writeFileSync('./realms-stats/output/proposals.json', JSON.stringify(finalProposals, null, 2))
    console.log('Written proposals for programId: ', programId, 'at index: ', i)
    i++
  }
}

async function fetchAllProposalsV1() {
  let finalProposals: Proposal[] = JSON.parse(fs.readFileSync('./realms-stats/output/proposals.json', 'utf-8'))
  let i = 0
  for (const programId of programIds) {
    const splGovernance = new SplGovernance(connection, new PublicKey(programId))
    const proposals: any = await splGovernance.getAllV1Proposals()
    const proposalsFormatted: Proposal[] = proposals.map((proposal: any) => ({
      publicKey: proposal.publicKey.toBase58(),
      tor: proposal.tokenOwnerRecord.toBase58(),
      balance: proposal.balance,
      self: isSelf(programId)
    }))

    finalProposals = [...finalProposals, ...proposalsFormatted]
    fs.writeFileSync('./realms-stats/output/proposals.json', JSON.stringify(finalProposals, null, 2))
    console.log('Written proposals for programId: ', programId, 'at index: ', i)
    i++
  }
}

async function fetchAllVotes() {
  let finalVotes: any = []
  let i = 0
  const programIdsFiltered = programIds.filter((programId) => programId !== 'pytGY6tWRgGinSCvRLnSv4fHfBTMoiDGiCsesmHWM6U')

  for (const programId of programIdsFiltered) {
    const splGovernance = new SplGovernance(connection, new PublicKey(programId))
    const votes = await splGovernance.getAllVoteRecords()
    const votesFormatted: Vote[] = votes.map((vote: any) => ({
      publicKey: vote.publicKey.toBase58(),
      proposal: vote.proposal.toBase58(),
      balance: vote.balance,
      self: isSelf(programId),
      voter: vote.governingTokenOwner.toBase58()
    }))

    finalVotes = [...finalVotes, ...votesFormatted]
    fs.writeFileSync('./realms-stats/output/votes.json', JSON.stringify(finalVotes, null, 2))
    console.log('Written votes for programId: ', programId, 'at index: ', i)
    i++
  }
}

async function fetchAllVotesForPyth() {
  const programId = "pytGY6tWRgGinSCvRLnSv4fHfBTMoiDGiCsesmHWM6U"

  const voteRecords = await connection.getProgramAccounts(new PublicKey(programId), {
    filters: [{
      memcmp: {
        offset: 0,
        bytes: 'D'
      }
    }],
    dataSlice: {
      length: 0,
      offset: 0
    }
  })

  console.log(voteRecords[0].pubkey.toBase58())
  console.log(voteRecords.length, "Vote Records Count")
}



function processData() {
  const proposals: Proposal[] = JSON.parse(fs.readFileSync('./realms-stats/output/proposals.json', 'utf-8'))
  const comments: Comment[] = JSON.parse(fs.readFileSync('./realms-stats/output/comments.json', 'utf-8'))
  const votes: Vote[] = JSON.parse(fs.readFileSync('./realms-stats/output/votes.json', 'utf-8'))

  const selfHostedProposals = proposals.filter((proposal) => proposal.self)
  const selfHostedVotes = votes.filter((vote) => vote.self)

  const proposalMoney = proposals.reduce((acc, proposal) => acc + proposal.balance, 0)
  const selfProposalMoney = selfHostedProposals.reduce((acc, proposal) => acc + proposal.balance, 0)

  const commentMoney = comments.reduce((acc, comment) => acc + comment.balance, 0)

  const voteMoney = votes.reduce((acc, vote) => acc + vote.balance, 0)
  const selfVoteMoney = selfHostedVotes.reduce((acc, vote) => acc + vote.balance, 0)

  const pythVoteCount = 988514
  const perVoteCost = 0.00146856
  const totalPythCost = pythVoteCount * perVoteCost
    
  console.log('Comments: ', comments.length)
  console.log('Comment Money: ', commentMoney)

  console.log('Proposals: ', proposals.length)
  console.log('Proposal Money: ', proposalMoney)
  console.log('Self Hosted Proposals: ', selfHostedProposals.length)
  console.log('Self Hosted Proposal Money: ', selfProposalMoney)

  console.log('Votes: ', votes.length + pythVoteCount)
  console.log('Vote Money: ', voteMoney + totalPythCost)
  console.log('Self Hosted Votes: ', selfHostedVotes.length + pythVoteCount)
  console.log('Self Hosted Vote Money: ', selfVoteMoney + totalPythCost)
  
}

(async() => {
  // PIPE
  // await fetchAllComments()
  // await fetchAllProposals()
  // await fetchAllProposalsV1()
  // await fetchAllVotes()
  // await fetchAllVotesForPyth()
  processData()
})()