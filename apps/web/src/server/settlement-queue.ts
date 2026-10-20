import 'server-only'
import { inShop, markExecutionSent } from '@hold/db'
import { executionMessage } from '@hold/settle'
import { getServices } from './services'
export async function sendSettlement(shopId: string, rentalId: string, executionId: string) {
  const { settle, database } = await getServices()
  await settle.send(executionMessage(shopId, rentalId, executionId))
  await inShop(database, { role: 'hold_app', shopId }, (transaction) => markExecutionSent(transaction, executionId, new Date()))
}
