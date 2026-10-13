import type { Request, Response } from 'express';
import { getGroupContext } from '../middleware/context';
import * as transactionService from '../services/transaction.service';
import { idParam } from '../validation/common.schemas';
import {
  bulkTransactionSchema,
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from '../validation/transaction.schemas';

export async function listTransactions(req: Request, res: Response): Promise<void> {
  const query = listTransactionsQuerySchema.parse(req.query);
  const { membership } = getGroupContext(res);
  res.json(await transactionService.listTransactions(membership, query));
}

export async function createTransaction(req: Request, res: Response): Promise<void> {
  const input = createTransactionSchema.parse(req.body);
  const { membership } = getGroupContext(res);
  const transaction = await transactionService.createOwnTransaction(membership, input);
  res.status(201).json({ transaction });
}

export async function createBulkTransactions(req: Request, res: Response): Promise<void> {
  const input = bulkTransactionSchema.parse(req.body);
  const { membership } = getGroupContext(res);
  const transactions = await transactionService.createBulkTransactions(membership, input);
  res.status(201).json({ transactions });
}

export async function updateTransaction(req: Request, res: Response): Promise<void> {
  const transactionId = idParam.parse(req.params.transactionId);
  const input = updateTransactionSchema.parse(req.body);
  const { membership } = getGroupContext(res);
  const transaction = await transactionService.updateTransaction(membership, transactionId, input);
  res.json({ transaction });
}
