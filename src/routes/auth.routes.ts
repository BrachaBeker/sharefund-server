import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/login', authController.login);

// These work also while the user still has a temporary password.
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateProfile);
router.post('/change-password', authenticate, authController.changePassword);

export default router;
