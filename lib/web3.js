'use strict'

const util = require('util')
const Web3 = require('web3')

const makeProvider = require('./provider')

function makeGetBlock (ethereumNode, wrapWeb3Error) {
  const provider = makeProvider(ethereumNode)
  const web3 = new Web3(provider)

  const _getBlock = util.promisify(web3.eth.getBlock.bind(web3.eth))
  const getBlock = arg => _getBlock(arg).catch(err => { throw wrapWeb3Error(err) })
  return getBlock
}
exports.makeGetBlock = makeGetBlock
