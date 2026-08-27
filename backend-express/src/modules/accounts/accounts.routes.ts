import { Router, Request, Response, NextFunction } from 'express';
import { AccountsService } from './accounts.service';
import { authenticate } from '../../middlewares/auth.middleware';
import { createCrudRouter } from '../../utils/crud-factory';

export const authRouter = Router();
export const accountsRouter = Router();

// =============================================================================
// AUTH ROUTES (/api/v1/auth/*)
// =============================================================================

// Token login
authRouter.post('/token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identifier = req.body.email || req.body.username || '';
    const password = req.body.password || '';
    const result = await AccountsService.login(identifier, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Token refresh
authRouter.post('/token/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refresh = req.body.refresh || '';
    const result = await AccountsService.refreshToken(refresh);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Token verify
authRouter.post('/token/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body.token || req.body.access || '';
    await AccountsService.refreshToken(token);
    res.json({});
  } catch (err) {
    next(err);
  }
});

// Signup / Register
authRouter.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, phone, password } = req.body;
    const result = await AccountsService.signup(name, email, phone, password);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, phone, password } = req.body;
    const result = await AccountsService.signup(name, email, phone, password);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Me
authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AccountsService.getCurrentUser(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Logout
authRouter.post('/logout', authenticate, (_req: Request, res: Response) => {
  res.status(204).send();
});

// Change Password
authRouter.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { current_password, new_password } = req.body;
    const result = await AccountsService.changePassword(req.user!.id, current_password, new_password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Update Profile (Full Name, Email)
authRouter.post('/update-profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { full_name, email, phone } = req.body;
    const result = await AccountsService.updateProfile(req.user!.id, { full_name, email, phone });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
authRouter.patch('/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { full_name, email, phone } = req.body;
    const result = await AccountsService.updateProfile(req.user!.id, { full_name, email, phone });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// ACCOUNTS ROUTES (/api/v1/accounts/*)
// =============================================================================

// Auth aliases under accounts
accountsRouter.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identifier = req.body.email || req.body.username || '';
    const password = req.body.password || '';
    const result = await AccountsService.login(identifier, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

accountsRouter.post('/auth/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refresh = req.body.refresh || '';
    const result = await AccountsService.refreshToken(refresh);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

accountsRouter.get('/auth/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AccountsService.getCurrentUser(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

accountsRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AccountsService.getCurrentUser(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

accountsRouter.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { current_password, new_password } = req.body;
    const result = await AccountsService.changePassword(req.user!.id, current_password, new_password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

accountsRouter.post('/update-profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { full_name, email, phone } = req.body;
    const result = await AccountsService.updateProfile(req.user!.id, { full_name, email, phone });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
accountsRouter.use('/users', createCrudRouter({ modelName: 'iam_user', searchFields: ['email', 'username', 'full_name'] }));
accountsRouter.use('/roles', createCrudRouter({ modelName: 'iam_role', searchFields: ['role_code', 'role_name'] }));
accountsRouter.use('/permissions', createCrudRouter({ modelName: 'iam_permission', searchFields: ['permission_code', 'module_code', 'resource_name'] }));
accountsRouter.use('/user-roles', createCrudRouter({ modelName: 'iam_user_role' }));
accountsRouter.use('/role-permissions', createCrudRouter({ modelName: 'iam_role_permission' }));
accountsRouter.use('/role-hierarchies', createCrudRouter({ modelName: 'iam_role_hierarchy' }));
accountsRouter.use('/data-scope-policies', createCrudRouter({ modelName: 'iam_data_scope_policy', searchFields: ['policy_code', 'module_code'] }));
accountsRouter.use('/role-data-scopes', createCrudRouter({ modelName: 'iam_role_data_scope' }));
accountsRouter.use('/field-permissions', createCrudRouter({ modelName: 'iam_field_permission', searchFields: ['module_code', 'field_name'] }));
accountsRouter.use('/information-share-rules', createCrudRouter({ modelName: 'iam_information_share_rule' }));
accountsRouter.use('/approval-limits', createCrudRouter({ modelName: 'iam_approval_limit' }));
accountsRouter.use('/user-project-accesses', createCrudRouter({ modelName: 'iam_user_project_access' }));
