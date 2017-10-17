import test from 'ava'
import delay from 'delay'

// Note that all tests share the same clock. Tests that advance the clock should
// be run serially.
import prepare, {clock} from './_prepare'

test.serial('isFinal() resolves with true when final block has expected hash', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    const {initialBlock} = t.context

    let expectedFinal = false
    const done = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
      .then(isFinal => t.is(isFinal, expectedFinal))

    await t.context.flushRequests() // get latest block

    await t.context.mineBlock()
    clock.runAll()
    await t.context.flushRequests() // get latest block

    await t.context.mineBlock()
    expectedFinal = true
    clock.runAll()
    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check hash

    await done
  }
}))

test.serial('isFinal() resolves with false when final block has different hash', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    const {initialBlock} = t.context
    await t.context.mineBlock()

    const done = t.context.watcher.isFinal(initialBlock.number + 1, initialBlock.hash)

    await t.context.flushRequests() // get latest block
    await t.context.mineBlock()
    await t.context.mineBlock()
    clock.runAll()
    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check hash

    t.false(await done)
  }
}))

test('isFinal() returns early if the block is known to be final', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    const {initialBlock} = t.context
    await t.context.mineBlock()
    await t.context.mineBlock()

    const done = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check hash

    t.true(await done)
    t.false(await t.context.watcher.isFinal(initialBlock.number, 'some other hash'))
  }
}))

test.serial('isFinal() remains pending if stopped while getting latest block', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    await t.context.mineBlock()
    await t.context.mineBlock()

    const {initialBlock} = t.context
    const done = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)

    t.context.watcher.stop()
    await t.context.flushRequests() // get latest block

    clock.runAll()
    await t.context.flushRequests() // "get" latest block
    await t.context.flushRequests() // "check" hash

    const result = await Promise.race([done, delay(10, 'pending')])
    t.is(result, 'pending')
  }
}))

test('isFinal() remains pending if stopped while getting block hash', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    await t.context.mineBlock()
    await t.context.mineBlock()

    const {initialBlock} = t.context
    const done = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
    await t.context.flushRequests() // get latest block

    t.context.watcher.stop()
    await t.context.flushRequests() // "check" hash

    const result = await Promise.race([done, delay(10, 'pending')])
    t.is(result, 'pending')
  }
}))

test.serial('isFinal() remains pending if called once stopped', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    t.context.watcher.stop()

    const {initialBlock} = t.context
    const done = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)

    await t.context.mineBlock()
    await t.context.mineBlock()
    clock.runAll()
    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check hash

    const result = await Promise.race([done, delay(10, 'pending')])
    t.is(result, 'pending')
  }
}))

test('calling isFinal() during the timeout preempts the timer', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    const {initialBlock} = t.context
    const nextBlock = await t.context.mineBlock()

    const initial = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
    await t.context.flushRequests() // get latest block

    await t.context.mineBlock()
    await t.context.mineBlock()

    const next = t.context.watcher.isFinal(nextBlock.number, nextBlock.hash)

    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check initial hash
    await t.context.flushRequests() // check next hash
    t.true(await initial)
    t.true(await next)
  }
}))

test.serial('calling isFinal() while waiting for an earlier block does not make it poll concurrently', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    const {initialBlock} = t.context
    const nextBlock = await t.context.mineBlock()

    const initial = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
    const next = t.context.watcher.isFinal(nextBlock.number, nextBlock.hash)
    await t.context.flushRequests() // get latest block

    await t.context.mineBlock()
    await t.context.mineBlock()

    clock.runAll()
    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check initial hash
    await t.context.flushRequests() // check next hash
    t.true(await initial)
    t.true(await next)
  }
}))

test('polling uses cached final blocks', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    const {initialBlock} = t.context
    await t.context.mineBlock()
    await t.context.mineBlock()

    const initial = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
    const dupe = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check hash

    t.true(await initial)
    t.true(await dupe)
  }
}))

test.serial('only checks for the latest block once while polling', prepare({
  blockchainConfirmationDelay: 2,
  async run (t) {
    const {initialBlock} = t.context
    const nextBlock = await t.context.mineBlock()

    const initial = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
    const next = t.context.watcher.isFinal(nextBlock.number, nextBlock.hash)
    await t.context.flushRequests() // get latest block

    await t.context.mineBlock()
    await t.context.mineBlock()

    clock.runAll()
    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check initial hash
    await t.context.flushRequests() // check next hash
    t.true(await initial)
    t.true(await next)
  }
}))

test('forwards errors to onError()', prepare({
  onError (t, err) {
    t.is(err, t.context.err)
    t.context.done()
  },

  async run (t) {
    const err = new Error()
    t.context.err = err

    const {initialBlock} = t.context
    t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)

    t.context.failRequests(err)
  }
}))

test('isFinal() remains pending if errors occur', prepare({
  onError () {},

  async run (t) {
    const {initialBlock} = t.context
    const done = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)

    await t.context.failRequests(new Error())
    const result = await Promise.race([done, delay(10, 'pending')])
    t.is(result, 'pending')
  }
}))

test.serial('isFinal() still returns even if errors occured in a previous round', prepare({
  blockchainConfirmationDelay: 2,
  onError () {},
  async run (t) {
    await t.context.mineBlock()
    await t.context.mineBlock()

    const {initialBlock} = t.context
    const done = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
    await t.context.failRequests(new Error())

    clock.runAll()
    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check hash

    t.true(await done)
  }
}))

test('can wrap Web3 errors', prepare({
  wrapWeb3Error (err) {
    return {err, wrapped: true}
  },

  onError (t, err) {
    t.is(err.err, t.context.err)
    t.true(err.wrapped)
    t.context.done()
  },

  async run (t) {
    const err = new Error()
    t.context.err = err

    // Inject the error into the provider, since wrapping takes place at the
    // Web3 layer, not the watcher itself.
    t.context.provider.sendAsync = (payload, callback) => {
      setImmediate(() => callback(err))
    }

    const {initialBlock} = t.context
    t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)

    try {
      await t.context.flushRequests()
    } finally {}
  }
}))

test('by default, forwards wrapped Web3 errors as-is', prepare({
  onError (t, err) {
    t.is(err, t.context.err)
    t.context.done()
  },

  async run (t) {
    const err = new Error()
    t.context.err = err

    // Inject the error into the provider, since wrapping takes place at the
    // Web3 layer, not the watcher itself.
    t.context.provider.sendAsync = (payload, callback) => {
      setImmediate(() => callback(err))
    }

    const {initialBlock} = t.context
    t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)

    try {
      await t.context.flushRequests()
    } finally {}
  }
}))

test.serial('has a default 30 second interval', prepare({
  defaultInterval: true,
  blockchainConfirmationDelay: 2,
  async run (t) {
    const {initialBlock} = t.context
    const done = t.context.watcher.isFinal(initialBlock.number, initialBlock.hash)
    await t.context.flushRequests() // get latest block

    await t.context.mineBlock()
    await t.context.mineBlock()

    clock.tick(29e3)

    await t.context.failRequests(new Error())
    await t.context.flushRequests() // "get" latest block
    await t.context.flushRequests() // "check" hash
    const result = await Promise.race([done, delay(10, 'pending')])
    t.is(result, 'pending')

    clock.tick(1e3)
    await t.context.flushRequests() // get latest block
    await t.context.flushRequests() // check hash
    t.true(await done)
  }
}))
