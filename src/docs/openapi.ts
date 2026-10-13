import { z } from 'zod';
import { changePasswordSchema, loginSchema, updateProfileSchema } from '../validation/auth.schemas';
import {
  closeGroupSchema,
  createGroupSchema,
  newMemberSchema,
  resetPasswordSchema,
} from '../validation/group.schemas';
import { sendMessageSchema } from '../validation/message.schemas';
import {
  bulkTransactionSchema,
  createTransactionSchema,
  updateTransactionSchema,
} from '../validation/transaction.schemas';

type Json = Record<string, unknown>;

/** The request bodies are generated from the same Zod schemas that validate the requests. */
function bodySchema(schema: z.ZodType): Json {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
  }) as Json;
  return rest;
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const refResponse = (name: string): Json => ({ $ref: `#/components/responses/${name}` });

const jsonContent = (schema: Json, example?: unknown): Json => ({
  'application/json': example === undefined ? { schema } : { schema, example },
});

const ok = (description: string, schema: Json, example?: unknown): Json => ({
  description,
  content: jsonContent(schema, example),
});

const error = (description: string, code: string, message: string, details?: unknown): Json => ({
  description,
  content: jsonContent(ref('Error'), {
    error: details === undefined ? { code, message } : { code, message, details },
  }),
});

const requestBody = (schema: z.ZodType, example: unknown): Json => ({
  required: true,
  content: jsonContent(bodySchema(schema), example),
});

const pathParam = (name: string, description: string): Json => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'integer', minimum: 1 },
});

const queryParam = (name: string, description: string, schema: Json): Json => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
});

const groupId = pathParam('groupId', 'מזהה הקבוצה');
const secured = [{ bearerAuth: [] }];

// Errors that every protected group route can return
const groupErrors = {
  '401': refResponse('Unauthorized'),
  '403': refResponse('Forbidden'),
  '404': refResponse('GroupNotFound'),
};

const num = (description: string): Json => ({ type: 'number', description });
const str = (description?: string): Json =>
  description ? { type: 'string', description } : { type: 'string' };
const int = (description?: string): Json =>
  description ? { type: 'integer', description } : { type: 'integer' };
const bool = (description?: string): Json =>
  description ? { type: 'boolean', description } : { type: 'boolean' };
const dateTime = (description?: string): Json => ({
  type: 'string',
  format: 'date-time',
  ...(description ? { description } : {}),
});
const nullable = (schema: Json): Json => ({ ...schema, nullable: true });
const object = (properties: Json, required?: string[]): Json => ({
  type: 'object',
  properties,
  required: required ?? Object.keys(properties),
});
const arrayOf = (items: Json): Json => ({ type: 'array', items });

const exampleUser = { id: 1, name: 'דנה לוי', email: 'dana@example.com', mustChangePassword: false };

const exampleTransaction = {
  id: 12,
  type: 'deposit',
  amount: 50,
  isShared: false,
  category: 'meeting',
  note: 'גבייה למסיבת סוף שנה',
  fundBalanceAfter: 130,
  createdAt: '2026-10-01T09:30:00.000Z',
  isMine: true,
  userId: 1,
  userName: 'דנה לוי',
  recordedByName: 'דנה לוי',
};

const exampleAnonymousTransaction = {
  ...exampleTransaction,
  id: 13,
  isMine: false,
  userId: null,
  userName: null,
  recordedByName: null,
};

const exampleMessage = {
  id: 4,
  content: 'שלום לכולם! אוספים 50 ש"ח למסיבת סוף השנה.',
  toAll: true,
  createdAt: '2026-10-01T09:30:00.000Z',
  direction: 'sent',
  sender: { id: 1, name: 'דנה לוי' },
  isRead: null,
  recipients: [{ userId: 2, name: 'יוסי כהן', readAt: null }],
};

const exampleGroup = {
  id: 1,
  name: 'קופת ועד הכיתה',
  isActive: true,
  createdAt: '2026-09-20T08:00:00.000Z',
  closedAt: null,
};

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'ShareFund API',
    version: '1.0.0',
    description: [
      'שרת לניהול קופה משותפת של קבוצה.',
      '',
      '**איך מתחברים כאן:** מריצים את `POST /api/auth/login`, מעתיקים את ה-`token` מהתשובה,',
      'לוחצים על **Authorize** למעלה ומדביקים אותו. מעכשיו כל הקריאות נשלחות עם הטוקן.',
      '',
      '**סכומים:** כל הסכומים ב-API הם בשקלים, עם עד שתי ספרות אחרי הנקודה.',
      '',
      '**שגיאות:** כל שגיאה חוזרת במבנה `{ "error": { "code", "message", "details"? } }`.',
      '401 = אין טוקן תקין. 403 = מחובר, אבל אין הרשאה לפעולה.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'השרת הנוכחי' }],
  tags: [
    { name: 'Health', description: 'בדיקת תקינות' },
    { name: 'Auth', description: 'התחברות ופרטי המשתמש' },
    { name: 'Groups', description: 'קבוצות' },
    { name: 'Members', description: 'חברי הקבוצה' },
    { name: 'Transactions', description: 'הפקדות, משיכות והיסטוריה' },
    { name: 'Messages', description: 'הודעות בין המנהל לחברים' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'הטוקן שמתקבל מ-POST /api/auth/login',
      },
    },
    schemas: {
      Error: object(
        {
          error: object(
            {
              code: str('מזהה קבוע באנגלית, למשל VALIDATION_ERROR'),
              message: str('הסבר בעברית שאפשר להציג למשתמש'),
              details: { description: 'פירוט נוסף, לא תמיד קיים' },
            },
            ['code', 'message'],
          ),
        },
        ['error'],
      ),
      User: object({
        id: int(),
        name: str(),
        email: str(),
        mustChangePassword: bool('true = יש להחליף סיסמה זמנית לפני כל פעולה אחרת'),
      }),
      Group: object({
        id: int(),
        name: str(),
        isActive: bool('false = קבוצה סגורה, לצפייה בלבד'),
        createdAt: dateTime(),
        closedAt: nullable(dateTime()),
      }),
      MyGroup: object({
        id: int(),
        name: str(),
        isActive: bool(),
        createdAt: dateTime(),
        closedAt: nullable(dateTime()),
        role: { type: 'string', enum: ['manager', 'member'] },
        myBalance: num('היתרה שלי בקבוצה. שלילי = חוב'),
      }),
      Dashboard: object({
        id: int(),
        name: str(),
        isActive: bool(),
        createdAt: dateTime(),
        closedAt: nullable(dateTime()),
        managerName: str(),
        membersCount: int('מספר החברים הפעילים'),
        role: { type: 'string', enum: ['manager', 'member'] },
        myBalance: num('היתרה שלי. שלילי = חוב'),
        fundBalance: num('יתרת הקופה. יכולה להיות שלילית'),
        totalDeposited: num('סך כל ההפקדות מפתיחת הקבוצה'),
      }),
      MemberForManager: object({
        userId: int(),
        name: str(),
        email: str(),
        role: { type: 'string', enum: ['manager', 'member'] },
        balance: num('שלילי = חוב'),
        joinedAt: dateTime(),
      }),
      MemberForMember: object({
        name: str(),
        role: { type: 'string', enum: ['manager', 'member'] },
      }),
      AddedMember: object({
        userId: int(),
        name: str(),
        email: str(),
        isNewUser: bool('false = המייל כבר היה רשום, והשם והסיסמה שנשלחו לא נשמרו'),
        role: { type: 'string', enum: ['member'] },
        balance: num('חבר חדש מתחיל מ-0'),
      }),
      Transaction: object({
        id: int(),
        type: { type: 'string', enum: ['deposit', 'withdraw'] },
        amount: num('תמיד חיובי'),
        isShared: bool('true = משיכה משותפת שהתחלקה בין כל החברים'),
        category: { type: 'string', enum: ['meeting', 'equipment', 'general', 'other'] },
        note: str(),
        fundBalanceAfter: num('יתרת הקופה אחרי התנועה'),
        createdAt: dateTime(),
        isMine: bool(),
        userId: nullable(int('null לחבר רגיל בתנועות של אחרים')),
        userName: nullable(str('null לחבר רגיל בתנועות של אחרים')),
        recordedByName: nullable(str('מי רשם את התנועה. null לחבר רגיל בתנועות של אחרים')),
      }),
      Message: object({
        id: int(),
        content: str(),
        toAll: bool(),
        createdAt: dateTime(),
        direction: { type: 'string', enum: ['sent', 'received'] },
        sender: object({ id: int(), name: str() }),
        isRead: nullable(bool('להודעה שקיבלתי: האם פתחתי אותה. null להודעה ששלחתי')),
        recipients: nullable(
          arrayOf(object({ userId: int(), name: str(), readAt: nullable(dateTime()) })),
        ),
      }),
    },
    responses: {
      Unauthorized: error('אין טוקן, או שהטוקן לא תקין או פג תוקף', 'TOKEN_MISSING', 'נדרשת התחברות'),
      Forbidden: error(
        'מחובר, אבל אין הרשאה: לא חבר בקבוצה (NOT_A_MEMBER), לא מנהל (MANAGER_ONLY), או סיסמה זמנית שלא הוחלפה (PASSWORD_CHANGE_REQUIRED)',
        'MANAGER_ONLY',
        'הפעולה מותרת למנהל הקבוצה בלבד',
      ),
      GroupNotFound: error('הקבוצה לא קיימת', 'GROUP_NOT_FOUND', 'הקבוצה לא נמצאה'),
      ValidationError: error('הנתונים שנשלחו לא תקינים', 'VALIDATION_ERROR', 'הנתונים שנשלחו אינם תקינים', [
        { field: 'amount', message: 'הסכום חייב להיות גדול מ-0' },
      ]),
      GroupClosed: error('הקבוצה סגורה', 'GROUP_CLOSED', 'הקבוצה סגורה ואי אפשר לבצע בה פעולות'),
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'בדיקת תקינות השרת ומסד הנתונים',
        responses: {
          '200': ok('השרת והמסד פעילים', object({ status: str(), database: str() }), {
            status: 'ok',
            database: 'ok',
          }),
          '503': ok('אין חיבור למסד הנתונים', object({ status: str(), database: str() }), {
            status: 'error',
            database: 'unreachable',
          }),
        },
      },
    },

    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'התחברות עם מייל וסיסמה',
        description: 'מחזיר טוקן JWT. אם `mustChangePassword` הוא true, יש להחליף סיסמה לפני כל פעולה אחרת.',
        requestBody: requestBody(loginSchema, { email: 'dana@example.com', password: 'MyPass123' }),
        responses: {
          '200': ok('התחברות הצליחה', object({ token: str(), user: ref('User') }), {
            token: 'eyJhbGciOiJIUzI1NiIs...',
            user: exampleUser,
          }),
          '400': refResponse('ValidationError'),
          '401': error('מייל או סיסמה שגויים', 'INVALID_CREDENTIALS', 'המייל או הסיסמה שגויים'),
        },
      },
    },

    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'פרטי המשתמש המחובר',
        security: secured,
        responses: {
          '200': ok('המשתמש המחובר', object({ user: ref('User') }), { user: exampleUser }),
          '401': refResponse('Unauthorized'),
        },
      },
      patch: {
        tags: ['Auth'],
        summary: 'עדכון השם של המשתמש המחובר',
        description: 'המייל הוא מזהה הכניסה ואי אפשר לשנות אותו.',
        security: secured,
        requestBody: requestBody(updateProfileSchema, { name: 'דנה לוי-כהן' }),
        responses: {
          '200': ok('השם עודכן', object({ user: ref('User') }), {
            user: { ...exampleUser, name: 'דנה לוי-כהן' },
          }),
          '400': refResponse('ValidationError'),
          '401': refResponse('Unauthorized'),
        },
      },
    },

    '/api/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'שינוי סיסמה',
        description: 'משמש גם להחלפת סיסמה זמנית בכניסה הראשונה.',
        security: secured,
        requestBody: requestBody(changePasswordSchema, {
          currentPassword: 'MyPass123',
          newPassword: 'MyNewPass2026',
        }),
        responses: {
          '200': ok('הסיסמה הוחלפה', object({ user: ref('User') }), { user: exampleUser }),
          '400': error(
            'נתונים לא תקינים (VALIDATION_ERROR) או סיסמה נוכחית שגויה',
            'WRONG_CURRENT_PASSWORD',
            'הסיסמה הנוכחית שגויה',
          ),
          '401': refResponse('Unauthorized'),
        },
      },
    },

    '/api/groups': {
      post: {
        tags: ['Groups'],
        summary: 'יצירת קבוצה חדשה',
        description: [
          'מותר גם לאורח וגם למשתמש מחובר.',
          '- **מחובר:** הוא המנהל. השדה `manager` לא נדרש.',
          '- **אורח:** חובה לשלוח `manager`. נוצר לו משתמש, והתשובה כוללת גם `token`.',
          '',
          'ב-`members` שולחים את החברים **חוץ מהמנהל**, לפחות 2.',
          'חבר שהמייל שלו כבר רשום רק משויך לקבוצה (`isNewUser: false`) והסיסמה שלו לא משתנה.',
        ].join('\n'),
        security: [{}, { bearerAuth: [] }],
        requestBody: requestBody(createGroupSchema, {
          groupName: 'קופת ועד הכיתה',
          manager: { name: 'דנה לוי', email: 'dana@example.com', password: 'MyPass123' },
          members: [
            { name: 'יוסי כהן', email: 'yossi@example.com', password: 'Temp1234' },
            { name: 'מיכל אברהם', email: 'michal@example.com', password: 'Temp1234' },
          ],
        }),
        responses: {
          '201': ok(
            'הקבוצה נוצרה',
            object(
              {
                group: ref('Group'),
                members: arrayOf(
                  object({ userId: int(), name: str(), email: str(), isNewUser: bool() }),
                ),
                token: str('רק כשאורח יצר את הקבוצה'),
              },
              ['group', 'members'],
            ),
            {
              group: exampleGroup,
              members: [
                { userId: 2, name: 'יוסי כהן', email: 'yossi@example.com', isNewUser: true },
                { userId: 3, name: 'מיכל אברהם', email: 'michal@example.com', isNewUser: true },
              ],
              token: 'eyJhbGciOiJIUzI1NiIs...',
            },
          ),
          '400': error(
            'נתונים לא תקינים: פחות מ-3 חברים, מייל כפול (VALIDATION_ERROR), חסרים פרטי מנהל (MANAGER_REQUIRED) או מייל המנהל ברשימת החברים (MANAGER_IN_MEMBERS)',
            'VALIDATION_ERROR',
            'הנתונים שנשלחו אינם תקינים',
            [{ field: 'members', message: 'קבוצה חייבת לכלול לפחות 3 חברים (המנהל ועוד 2)' }],
          ),
          '401': error('נשלח טוקן לא תקין', 'TOKEN_INVALID', 'הטוקן אינו תקין או שפג תוקפו'),
          '403': error(
            'המשתמש המחובר עדיין לא החליף סיסמה זמנית',
            'PASSWORD_CHANGE_REQUIRED',
            'יש להחליף את הסיסמה הזמנית לפני המשך השימוש',
          ),
          '409': error(
            'אורח ניסה ליצור קבוצה עם מייל מנהל שכבר רשום',
            'EMAIL_EXISTS_LOGIN_REQUIRED',
            'המייל כבר רשום במערכת. יש להתחבר ואז ליצור את הקבוצה',
          ),
        },
      },
      get: {
        tags: ['Groups'],
        summary: 'הקבוצות שלי',
        description: 'כל הקבוצות שאני חבר פעיל בהן, כולל קבוצות סגורות, עם התפקיד והיתרה שלי בכל אחת.',
        security: secured,
        responses: {
          '200': ok('רשימת הקבוצות', object({ groups: arrayOf(ref('MyGroup')) }), {
            groups: [{ ...exampleGroup, role: 'manager', myBalance: 8.63 }],
          }),
          '401': refResponse('Unauthorized'),
          '403': refResponse('Forbidden'),
        },
      },
    },

    '/api/groups/{groupId}': {
      get: {
        tags: ['Groups'],
        summary: 'האזור האישי של קבוצה',
        description: 'יתרת הקופה, היתרה שלי והתפקיד שלי. מותר לכל חבר פעיל בקבוצה.',
        security: secured,
        parameters: [groupId],
        responses: {
          '200': ok('נתוני הקבוצה', object({ group: ref('Dashboard') }), {
            group: {
              ...exampleGroup,
              managerName: 'דנה לוי',
              membersCount: 4,
              role: 'manager',
              myBalance: 8.63,
              fundBalance: 14.5,
              totalDeposited: 180,
            },
          }),
          ...groupErrors,
        },
      },
    },

    '/api/groups/{groupId}/close': {
      post: {
        tags: ['Groups'],
        summary: 'סגירת הקבוצה (מנהל בלבד)',
        description: [
          'כשכל היתרות 0 הקבוצה נסגרת מיד.',
          'כשיש יתרות שאינן 0 חוזרת שגיאה 409 `BALANCES_NOT_ZERO` עם רשימת החברים.',
          'אחרי שהמנהל מאשר, שולחים שוב עם `force: true`.',
          'קבוצה סגורה נשארת לצפייה בלבד.',
        ].join('\n'),
        security: secured,
        parameters: [groupId],
        requestBody: {
          required: false,
          content: jsonContent(bodySchema(closeGroupSchema), { force: false }),
        },
        responses: {
          '200': ok('הקבוצה נסגרה', object({ group: ref('Group') }), {
            group: { ...exampleGroup, isActive: false, closedAt: '2026-10-13T10:00:00.000Z' },
          }),
          ...groupErrors,
          '409': error(
            'יש יתרות שאינן 0 ולא נשלח force (BALANCES_NOT_ZERO), או שהקבוצה כבר סגורה (GROUP_CLOSED)',
            'BALANCES_NOT_ZERO',
            'יש חברים שהיתרה שלהם אינה 0. לסגור בכל זאת?',
            { fundBalance: -30, members: [{ userId: 4, name: 'אבי מזרחי', balance: -30 }] },
          ),
        },
      },
    },

    '/api/groups/{groupId}/leave': {
      post: {
        tags: ['Groups'],
        summary: 'יציאה מהקבוצה (חבר רגיל בלבד)',
        description: 'מותר רק כשהיתרה שלי 0 וכשיישארו בקבוצה לפחות 3 חברים. מנהל לא יכול לצאת.',
        security: secured,
        parameters: [groupId],
        responses: {
          '204': { description: 'יצאת מהקבוצה' },
          ...groupErrors,
          '409': error(
            'יתרה שאינה 0 (BALANCE_NOT_ZERO), פחות מ-3 חברים (MIN_MEMBERS) או קבוצה סגורה (GROUP_CLOSED)',
            'BALANCE_NOT_ZERO',
            'יציאה או הסרה מהקבוצה אפשריות רק כשיתרת החבר היא 0',
            { balance: -11.37 },
          ),
        },
      },
    },

    '/api/groups/{groupId}/members': {
      get: {
        tags: ['Members'],
        summary: 'רשימת חברי הקבוצה',
        description: [
          'התשובה תלויה בתפקיד:',
          '- **מנהל** מקבל מזהה, שם, מייל, תפקיד ויתרה.',
          '- **חבר** מקבל שם ותפקיד בלבד.',
        ].join('\n'),
        security: secured,
        parameters: [
          groupId,
          queryParam('search', 'חיפוש לפי שם (למנהל גם לפי מייל)', { type: 'string' }),
          queryParam('balanceStatus', 'מנהל בלבד: סינון לפי מצב היתרה', {
            type: 'string',
            enum: ['debt', 'zero', 'credit'],
          }),
        ],
        responses: {
          '200': ok(
            'רשימת החברים',
            object({
              members: {
                oneOf: [arrayOf(ref('MemberForManager')), arrayOf(ref('MemberForMember'))],
              },
            }),
            {
              members: [
                {
                  userId: 1,
                  name: 'דנה לוי',
                  email: 'dana@example.com',
                  role: 'manager',
                  balance: 8.63,
                  joinedAt: '2026-09-20T08:00:00.000Z',
                },
              ],
            },
          ),
          '400': refResponse('ValidationError'),
          ...groupErrors,
        },
      },
      post: {
        tags: ['Members'],
        summary: 'הוספת חבר לקבוצה (מנהל בלבד)',
        description:
          'חבר חדש מתחיל מיתרה 0 ומקבל סיסמה זמנית. מייל שכבר רשום רק משויך לקבוצה. חבר שהוסר בעבר מופעל מחדש.',
        security: secured,
        parameters: [groupId],
        requestBody: requestBody(newMemberSchema, {
          name: 'נועה פרץ',
          email: 'noa@example.com',
          password: 'Temp1234',
        }),
        responses: {
          '201': ok('החבר נוסף', object({ member: ref('AddedMember') }), {
            member: {
              userId: 5,
              name: 'נועה פרץ',
              email: 'noa@example.com',
              isNewUser: true,
              role: 'member',
              balance: 0,
            },
          }),
          '400': refResponse('ValidationError'),
          ...groupErrors,
          '409': error(
            'כבר חבר בקבוצה (ALREADY_MEMBER) או קבוצה סגורה (GROUP_CLOSED)',
            'ALREADY_MEMBER',
            'המשתמש כבר חבר בקבוצה',
          ),
        },
      },
    },

    '/api/groups/{groupId}/members/{userId}': {
      delete: {
        tags: ['Members'],
        summary: 'הסרת חבר מהקבוצה (מנהל בלבד)',
        description:
          'מחיקה רכה: התנועות של החבר נשארות בהיסטוריה. מותר רק כשיתרת החבר 0 וכשיישארו לפחות 3 חברים.',
        security: secured,
        parameters: [groupId, pathParam('userId', 'מזהה המשתמש להסרה')],
        responses: {
          '204': { description: 'החבר הוסר' },
          '400': error('ניסיון להסיר את המנהל', 'CANNOT_REMOVE_MANAGER', 'אי אפשר להסיר את מנהל הקבוצה'),
          '401': refResponse('Unauthorized'),
          '403': refResponse('Forbidden'),
          '404': error(
            'הקבוצה לא קיימת (GROUP_NOT_FOUND) או שהחבר לא בקבוצה (MEMBER_NOT_FOUND)',
            'MEMBER_NOT_FOUND',
            'החבר לא נמצא בקבוצה',
          ),
          '409': error(
            'יתרה שאינה 0 (BALANCE_NOT_ZERO), פחות מ-3 חברים (MIN_MEMBERS) או קבוצה סגורה (GROUP_CLOSED)',
            'MIN_MEMBERS',
            'בקבוצה חייבים להישאר לפחות 3 חברים',
          ),
        },
      },
    },

    '/api/groups/{groupId}/members/{userId}/reset-password': {
      post: {
        tags: ['Members'],
        summary: 'איפוס סיסמה זמנית לחבר (מנהל בלבד)',
        description: 'החבר יידרש להחליף את הסיסמה בכניסה הבאה. הסיסמה משותפת לכל הקבוצות של החבר.',
        security: secured,
        parameters: [groupId, pathParam('userId', 'מזהה המשתמש')],
        requestBody: requestBody(resetPasswordSchema, { newPassword: 'Temp5678' }),
        responses: {
          '204': { description: 'הסיסמה אופסה' },
          '400': error(
            'נתונים לא תקינים (VALIDATION_ERROR) או ניסיון לאפס לעצמי (USE_CHANGE_PASSWORD)',
            'USE_CHANGE_PASSWORD',
            'כדי לשנות את הסיסמה שלך יש להשתמש בשינוי סיסמה',
          ),
          '401': refResponse('Unauthorized'),
          '403': refResponse('Forbidden'),
          '404': error('החבר לא בקבוצה', 'MEMBER_NOT_FOUND', 'החבר לא נמצא בקבוצה'),
          '409': refResponse('GroupClosed'),
        },
      },
    },

    '/api/groups/{groupId}/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'היסטוריית התנועות של הקופה',
        description: [
          'התשובה תלויה בתפקיד:',
          '- **מנהל** רואה בכל תנועה את שם החבר.',
          '- **חבר** רואה שם רק בתנועות שלו. בתנועות של אחרים `userId`, `userName` ו-`recordedByName` הם null.',
          '',
          'ב-`summary` חוזרים תמיד סך כל ההפקדות ויתרת הקופה, בלי קשר לסינון.',
        ].join('\n'),
        security: secured,
        parameters: [
          groupId,
          queryParam('search', 'חיפוש בהערה (למנהל גם בשם החבר)', { type: 'string' }),
          queryParam('type', 'סוג התנועה', { type: 'string', enum: ['deposit', 'withdraw'] }),
          queryParam('category', 'קטגוריה', {
            type: 'string',
            enum: ['meeting', 'equipment', 'general', 'other'],
          }),
          queryParam('userId', 'מנהל בלבד: תנועות של חבר מסוים', { type: 'integer' }),
          queryParam('mine', 'רק התנועות שלי', { type: 'boolean' }),
          queryParam('from', 'מתאריך (כולל), למשל 2026-10-01', { type: 'string', format: 'date-time' }),
          queryParam('to', 'עד תאריך (כולל)', { type: 'string', format: 'date-time' }),
          queryParam('sort', 'סדר המיון', {
            type: 'string',
            enum: ['newest', 'oldest'],
            default: 'newest',
          }),
          queryParam('page', 'מספר העמוד', { type: 'integer', default: 1, minimum: 1 }),
          queryParam('pageSize', 'תנועות בעמוד', {
            type: 'integer',
            default: 50,
            minimum: 1,
            maximum: 200,
          }),
        ],
        responses: {
          '200': ok(
            'התנועות',
            object({
              summary: object({ totalDeposited: num('סך כל ההפקדות'), fundBalance: num('יתרת הקופה') }),
              page: int(),
              pageSize: int(),
              total: int('מספר התנועות שעונות על הסינון'),
              items: arrayOf(ref('Transaction')),
            }),
            {
              summary: { totalDeposited: 180, fundBalance: 14.5 },
              page: 1,
              pageSize: 50,
              total: 2,
              items: [exampleTransaction, exampleAnonymousTransaction],
            },
          ),
          '400': refResponse('ValidationError'),
          ...groupErrors,
        },
      },
      post: {
        tags: ['Transactions'],
        summary: 'הפקדה או משיכה על שמי',
        description: [
          '- `deposit`: היתרה שלי והקופה עולות בסכום.',
          '- `withdraw` עם `isShared: false`: משיכה אישית, יורדת מהיתרה שלי.',
          '- `withdraw` עם `isShared: true`: הוצאה של הקבוצה, מתחלקת שווה בין כל החברים הפעילים.',
        ].join('\n'),
        security: secured,
        parameters: [groupId],
        requestBody: requestBody(createTransactionSchema, {
          type: 'withdraw',
          amount: 120,
          isShared: true,
          category: 'meeting',
          note: 'השכרת אולם למסיבה',
        }),
        responses: {
          '201': ok('התנועה נרשמה', object({ transaction: ref('Transaction') }), {
            transaction: exampleTransaction,
          }),
          '400': refResponse('ValidationError'),
          ...groupErrors,
          '409': refResponse('GroupClosed'),
        },
      },
    },

    '/api/groups/{groupId}/transactions/bulk': {
      post: {
        tags: ['Transactions'],
        summary: 'רישום מרוכז לכמה חברים (מנהל בלבד)',
        description:
          'המנהל רושם הפקדה או משיכה אישית לכל חבר, עם סכום שונה לכל אחד. משמש לגבייה מרוכזת ולאיפוס יתרה של חבר. נוצרת תנועה אחת לכל חבר, והכול נשמר יחד או לא נשמר בכלל.',
        security: secured,
        parameters: [groupId],
        requestBody: requestBody(bulkTransactionSchema, {
          type: 'deposit',
          category: 'meeting',
          note: 'גבייה למסיבת סוף שנה',
          items: [
            { userId: 1, amount: 50 },
            { userId: 2, amount: 30 },
          ],
        }),
        responses: {
          '201': ok('התנועות נרשמו', object({ transactions: arrayOf(ref('Transaction')) }), {
            transactions: [exampleTransaction],
          }),
          '400': error(
            'נתונים לא תקינים (VALIDATION_ERROR) או חבר שאינו פעיל בקבוצה (MEMBER_NOT_FOUND)',
            'MEMBER_NOT_FOUND',
            'אחד או יותר מהחברים אינו חבר פעיל בקבוצה',
          ),
          ...groupErrors,
          '409': refResponse('GroupClosed'),
        },
      },
    },

    '/api/groups/{groupId}/transactions/{transactionId}': {
      patch: {
        tags: ['Transactions'],
        summary: 'עריכת קטגוריה והערה של תנועה',
        description:
          'מנהל יכול לערוך כל תנועה, חבר רק תנועות שלו. אי אפשר לשנות סכום או סוג; טעות מתקנים בתנועה הפוכה.',
        security: secured,
        parameters: [groupId, pathParam('transactionId', 'מזהה התנועה')],
        requestBody: requestBody(updateTransactionSchema, {
          category: 'equipment',
          note: 'קניית כדורים',
        }),
        responses: {
          '200': ok('התנועה עודכנה', object({ transaction: ref('Transaction') }), {
            transaction: { ...exampleTransaction, category: 'equipment', note: 'קניית כדורים' },
          }),
          '400': refResponse('ValidationError'),
          '401': refResponse('Unauthorized'),
          '403': error(
            'לא חבר בקבוצה, או חבר שמנסה לערוך תנועה של מישהו אחר',
            'NOT_YOUR_TRANSACTION',
            'אפשר לערוך רק תנועות שלך',
          ),
          '404': error(
            'הקבוצה או התנועה לא קיימות',
            'TRANSACTION_NOT_FOUND',
            'התנועה לא נמצאה',
          ),
          '409': refResponse('GroupClosed'),
        },
      },
    },

    '/api/groups/{groupId}/messages': {
      get: {
        tags: ['Messages'],
        summary: 'ההודעות שלי בקבוצה',
        description: 'רק הודעות ששלחתי או שנשלחו אליי. `unreadCount` הוא מספר ההודעות שעוד לא פתחתי.',
        security: secured,
        parameters: [
          groupId,
          queryParam('box', 'inbox = שקיבלתי, sent = ששלחתי, all = הכול', {
            type: 'string',
            enum: ['all', 'inbox', 'sent'],
            default: 'all',
          }),
          queryParam('unreadOnly', 'רק הודעות שלא נקראו', { type: 'boolean' }),
        ],
        responses: {
          '200': ok(
            'ההודעות, מהחדשה לישנה',
            object({ unreadCount: int(), items: arrayOf(ref('Message')) }),
            { unreadCount: 0, items: [exampleMessage] },
          ),
          '400': refResponse('ValidationError'),
          ...groupErrors,
        },
      },
      post: {
        tags: ['Messages'],
        summary: 'שליחת הודעה',
        description: [
          '- **מנהל** שולח `toAll: true`, או `recipientIds` עם החברים שבחר.',
          '- **חבר** שולח רק `content`, וההודעה נשלחת למנהל הקבוצה.',
        ].join('\n'),
        security: secured,
        parameters: [groupId],
        requestBody: requestBody(sendMessageSchema, {
          content: 'שלום לכולם! אוספים 50 ש"ח למסיבת סוף השנה.',
          toAll: true,
        }),
        responses: {
          '201': ok('ההודעה נשלחה', object({ message: ref('Message') }), {
            message: exampleMessage,
          }),
          '400': error(
            'נתונים לא תקינים (VALIDATION_ERROR), מנהל שלא בחר נמענים (RECIPIENTS_REQUIRED) או נמען שאינו חבר פעיל (MEMBER_NOT_FOUND)',
            'RECIPIENTS_REQUIRED',
            'יש לבחור נמענים או לשלוח לכולם',
          ),
          '401': refResponse('Unauthorized'),
          '403': error(
            'לא חבר בקבוצה, או חבר רגיל שניסה לבחור נמענים',
            'MANAGER_ONLY',
            'חבר יכול לשלוח הודעות למנהל הקבוצה בלבד',
          ),
          '404': refResponse('GroupNotFound'),
          '409': refResponse('GroupClosed'),
        },
      },
    },

    '/api/groups/{groupId}/messages/{messageId}/read': {
      post: {
        tags: ['Messages'],
        summary: 'סימון הודעה שקיבלתי כנקראה',
        security: secured,
        parameters: [groupId, pathParam('messageId', 'מזהה ההודעה')],
        responses: {
          '204': { description: 'ההודעה סומנה כנקראה' },
          '401': refResponse('Unauthorized'),
          '403': refResponse('Forbidden'),
          '404': error(
            'הקבוצה לא קיימת, או שההודעה לא נשלחה אליי',
            'MESSAGE_NOT_FOUND',
            'ההודעה לא נמצאה',
          ),
        },
      },
    },
  },
};
