import type { QueueMessage, Scheduler } from './dependencies.ts'

export type ScheduledWork = { readonly name: string; readonly at: Date; readonly message: QueueMessage }

export type MemoryScheduler = Scheduler & {
  // Every schedule still to fire, soonest first.
  scheduled(): readonly ScheduledWork[]
}

// Schedules kept in memory, for the tests and the test environment, where nothing fires on its own.
export function createMemoryScheduler(): MemoryScheduler {
  const schedules = new Map<string, ScheduledWork>()
  return {
    at(name, at, message) {
      schedules.set(name, { name, at, message })
      return Promise.resolve()
    },
    remove(name) {
      schedules.delete(name)
      return Promise.resolve()
    },
    scheduled() {
      return [...schedules.values()].sort((first, second) => first.at.getTime() - second.at.getTime())
    },
  }
}
