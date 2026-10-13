import { Router } from 'express';
import * as groupController from '../controllers/group.controller';
import * as memberController from '../controllers/member.controller';
import * as messageController from '../controllers/message.controller';
import * as transactionController from '../controllers/transaction.controller';
import {
  authenticate,
  optionalAuthenticate,
  requirePasswordChanged,
} from '../middleware/authenticate';
import { loadMembership, requireManager, requireOpenGroup } from '../middleware/groupAccess';

const router = Router();

// A guest may create a group too (and becomes a new user), so the token is optional here.
router.post('/', optionalAuthenticate, groupController.createGroup);

// Everything below requires a logged-in user who already replaced a temporary password.
router.use(authenticate, requirePasswordChanged);

router.get('/', groupController.listMyGroups);

// Everything under /:groupId requires an active membership in that group.
const group = Router({ mergeParams: true });
router.use('/:groupId', loadMembership, group);

group.get('/', groupController.getDashboard);
group.post('/close', requireManager, groupController.closeGroup);
group.post('/leave', requireOpenGroup, groupController.leaveGroup);

group.get('/members', memberController.listMembers);
group.post('/members', requireManager, requireOpenGroup, memberController.addMember);
group.delete('/members/:userId', requireManager, requireOpenGroup, memberController.removeMember);
group.post(
  '/members/:userId/reset-password',
  requireManager,
  requireOpenGroup,
  memberController.resetPassword,
);

group.get('/transactions', transactionController.listTransactions);
group.post('/transactions', requireOpenGroup, transactionController.createTransaction);
group.post(
  '/transactions/bulk',
  requireManager,
  requireOpenGroup,
  transactionController.createBulkTransactions,
);
group.patch(
  '/transactions/:transactionId',
  requireOpenGroup,
  transactionController.updateTransaction,
);

group.get('/messages', messageController.listMessages);
group.post('/messages', requireOpenGroup, messageController.sendMessage);
group.post('/messages/:messageId/read', messageController.markAsRead);

export default router;
