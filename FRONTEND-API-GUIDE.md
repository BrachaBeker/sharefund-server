# מדריך API לצד ה-React

המסמך מסביר איך צד הלקוח מדבר עם השרת של ShareFund: כתובות, מה שולחים, מה חוזר ומה מציגים.
אין כאן קוד React. את הקומפוננטות, ה-Hooks, הנתיבים והטפסים כותבים לבד, לפי המידע שכאן.

לניסוי חי של כל כתובת: `/api-docs` (Swagger).

## 1. כתובת הבסיס (Base URL)

| סביבה | כתובת |
| --- | --- |
| במחשב | `http://localhost:5000/api` |
| באינטרנט | `https://YOUR-SERVER.onrender.com/api` |

כדאי לשמור את הכתובת במשתנה סביבה של Vite (למשל `VITE_API_URL`) ולא לכתוב אותה בתוך הקוד.
כל הבקשות והתשובות הן JSON, ולכן בבקשות עם גוף שולחים את הכותרת `Content-Type: application/json`.

## 2. התחברות (Authentication)

1. שולחים מייל וסיסמה ל-`POST /auth/login`.
2. בתשובה חוזרים `token` ו-`user`.
3. שומרים את הטוקן בצד הלקוח (למשל ב-`localStorage`).
4. בכל בקשה אחרת שולחים את הטוקן בכותרת.
5. הטוקן תקף שעתיים. כשמתקבל 401, מוחקים את הטוקן ומעבירים לעמוד הכניסה.

**שליחת הטוקן:**

```http
GET /api/groups
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

המילה `Bearer`, רווח, ואז הטוקן. הכי נוח להגדיר את זה פעם אחת ב-interceptor של axios.

**רענון הדף:** אחרי רענון ה-state נמחק אבל הטוקן נשאר ב-`localStorage`.
קוראים ל-`GET /auth/me` כדי לקבל שוב את פרטי המשתמש.

**אין התנתקות בשרת.** התנתקות היא מחיקת הטוקן בצד הלקוח.

### סיסמה זמנית

חבר שמנהל הוסיף מקבל סיסמה זמנית. אצלו `user.mustChangePassword` הוא `true`.
עד שיחליף סיסמה, כל כתובת תחת `/groups` מחזירה לו 403 עם הקוד `PASSWORD_CHANGE_REQUIRED`.
לכן, כש-`mustChangePassword` הוא `true`, מעבירים אותו לעמוד שינוי הסיסמה וחוסמים את שאר העמודים.

## 3. סכומים ותאריכים

- **סכומים** נשלחים וחוזרים בשקלים, כמספר (לא כמחרוזת), עם עד שתי ספרות אחרי הנקודה: `20`, `45.5`, `33.34`.
- סכום בבקשה הוא תמיד חיובי. הכיוון נקבע בשדה `type`.
- **יתרה** יכולה להיות שלילית: שלילי פירושו חוב, חיובי פירושו זכות.
- **תאריכים** חוזרים בפורמט ISO, למשל `2026-10-13T09:30:00.000Z`. מציגים אותם עם `new Date(...)`.

## 4. שגיאות

כל שגיאה חוזרת באותו מבנה:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "הנתונים שנשלחו אינם תקינים",
    "details": [{ "field": "amount", "message": "הסכום חייב להיות גדול מ-0" }]
  }
}
```

- `code` – מזהה קבוע באנגלית. לפיו מחליטים בקוד מה לעשות.
- `message` – הסבר בעברית שאפשר להציג למשתמש כמו שהוא.
- `details` – לא תמיד קיים. בשגיאת קלט זו רשימה של שדה והודעה, שאפשר להציג ליד השדות בטופס.

| סטטוס | משמעות | מה עושים בצד הלקוח |
| --- | --- | --- |
| 400 | הקלט לא תקין | מציגים את ההודעות ליד השדות |
| 401 | אין טוקן, או שהוא לא תקין או פג תוקף | מוחקים את הטוקן ועוברים לכניסה |
| 403 | מחובר, אבל אין הרשאה | מציגים את `message`, או מעבירים לשינוי סיסמה |
| 404 | הקבוצה, החבר, התנועה או ההודעה לא נמצאו | מציגים הודעה או חוזרים לרשימה |
| 409 | הפעולה מתנגשת עם מצב הנתונים | מציגים את `message`, ובסגירת קבוצה פותחים חלון אישור |
| 500 | תקלה בשרת | מציגים הודעה כללית |

**קודי השגיאה העיקריים:**

| code | סטטוס | מתי |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | קלט לא תקין |
| `INVALID_CREDENTIALS` | 401 | מייל או סיסמה שגויים |
| `TOKEN_MISSING` / `TOKEN_INVALID` | 401 | אין טוקן / טוקן לא תקין או פג תוקף |
| `PASSWORD_CHANGE_REQUIRED` | 403 | סיסמה זמנית שעוד לא הוחלפה |
| `NOT_A_MEMBER` | 403 | המשתמש לא חבר פעיל בקבוצה |
| `MANAGER_ONLY` | 403 | פעולה של מנהל בלבד |
| `MANAGER_CANNOT_LEAVE` | 403 | מנהל ניסה לצאת מהקבוצה |
| `NOT_YOUR_TRANSACTION` | 403 | חבר ניסה לערוך תנועה של אחר |
| `GROUP_NOT_FOUND` / `MEMBER_NOT_FOUND` / `TRANSACTION_NOT_FOUND` / `MESSAGE_NOT_FOUND` | 404 | לא נמצא |
| `EMAIL_EXISTS_LOGIN_REQUIRED` | 409 | אורח יצר קבוצה עם מייל מנהל שכבר רשום |
| `ALREADY_MEMBER` | 409 | המשתמש כבר חבר בקבוצה |
| `BALANCE_NOT_ZERO` | 409 | יציאה או הסרה כשיתרת החבר אינה 0 |
| `MIN_MEMBERS` | 409 | יישארו פחות מ-3 חברים |
| `BALANCES_NOT_ZERO` | 409 | סגירת קבוצה כשיש יתרות, בלי `force` |
| `GROUP_CLOSED` | 409 | פעולת כתיבה בקבוצה סגורה |

## 5. רשימת הכתובות

כל הכתובות יחסיות לכתובת הבסיס. "מחובר" פירושו שחייבים לשלוח טוקן.

| Method | כתובת | מי רשאי | מה עושה |
| --- | --- | --- | --- |
| GET | `/health` | כולם | בדיקת תקינות |
| POST | `/auth/login` | כולם | התחברות |
| GET | `/auth/me` | מחובר | פרטי המשתמש המחובר |
| PATCH | `/auth/me` | מחובר | עדכון השם שלי |
| POST | `/auth/change-password` | מחובר | שינוי סיסמה |
| POST | `/groups` | כולם | יצירת קבוצה |
| GET | `/groups` | מחובר | הקבוצות שלי |
| GET | `/groups/:groupId` | חבר בקבוצה | נתוני האזור האישי |
| POST | `/groups/:groupId/close` | מנהל | סגירת הקבוצה |
| POST | `/groups/:groupId/leave` | חבר רגיל | יציאה מהקבוצה |
| GET | `/groups/:groupId/members` | חבר בקבוצה | רשימת חברים |
| POST | `/groups/:groupId/members` | מנהל | הוספת חבר |
| DELETE | `/groups/:groupId/members/:userId` | מנהל | הסרת חבר |
| POST | `/groups/:groupId/members/:userId/reset-password` | מנהל | איפוס סיסמה לחבר |
| GET | `/groups/:groupId/transactions` | חבר בקבוצה | היסטוריה |
| POST | `/groups/:groupId/transactions` | חבר בקבוצה | הפקדה או משיכה על שמי |
| POST | `/groups/:groupId/transactions/bulk` | מנהל | רישום מרוכז לכמה חברים |
| PATCH | `/groups/:groupId/transactions/:transactionId` | מנהל, או בעל התנועה | עריכת קטגוריה והערה |
| GET | `/groups/:groupId/messages` | חבר בקבוצה | ההודעות שלי |
| POST | `/groups/:groupId/messages` | חבר בקבוצה | שליחת הודעה |
| POST | `/groups/:groupId/messages/:messageId/read` | חבר בקבוצה | סימון הודעה כנקראה |

## 6. אילו כתובות צריך בכל מסך

| מסך | כתובות | הערות |
| --- | --- | --- |
| דף הבית | אין | |
| כניסה | `POST /auth/login`, ואז `GET /groups` | לפי התשובות מחליטים לאן לעבור (ראו למטה) |
| שינוי סיסמה | `POST /auth/change-password` | |
| הוספת קבוצה חדשה | `POST /groups` | אורח שולח גם `manager`; מחובר לא |
| בחירת קבוצה | `GET /groups` | |
| אזור אישי | `GET /groups/:id`, `POST .../transactions`, `POST .../leave` או `POST .../close` | |
| רשימת חברים | `GET .../members`, ולמנהל גם `POST .../members`, `DELETE .../members/:userId`, `POST .../reset-password`, `POST .../transactions/bulk` | |
| היסטוריה | `GET .../transactions`, `PATCH .../transactions/:id` | |
| הודעות | `GET .../messages`, `POST .../messages`, `POST .../messages/:id/read`, ולמנהל גם `GET .../members` לבחירת נמענים | |
| Header | `GET /auth/me` אחרי רענון, `GET /groups/:id` לשם הקבוצה ולתפקיד | |

**לאן עוברים אחרי כניסה:**

1. `user.mustChangePassword` הוא `true` → עמוד שינוי סיסמה.
2. אחרת קוראים ל-`GET /groups`:
   - קבוצה אחת → ישר לאזור האישי שלה.
   - כמה קבוצות, או אף קבוצה → עמוד בחירת קבוצה.

## 7. פירוט הכתובות

### POST `/auth/login`

בקשה:

```json
{ "email": "dana@example.com", "password": "MyPass123" }
```

תשובה 200:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": 1, "name": "דנה לוי", "email": "dana@example.com", "mustChangePassword": false }
}
```

שגיאות: 400 `VALIDATION_ERROR`, 401 `INVALID_CREDENTIALS`.

### GET `/auth/me`

תשובה 200: `{ "user": { "id", "name", "email", "mustChangePassword" } }`

### PATCH `/auth/me`

בקשה: `{ "name": "דנה לוי-כהן" }` – תשובה 200: `{ "user": { ... } }`.
אפשר לשנות רק את השם. המייל הוא מזהה הכניסה ואינו ניתן לשינוי.

### POST `/auth/change-password`

בקשה:

```json
{ "currentPassword": "Temp1234", "newPassword": "MyNewPass2026" }
```

תשובה 200: `{ "user": { ..., "mustChangePassword": false } }`.
שגיאות: 400 `WRONG_CURRENT_PASSWORD`, 400 `VALIDATION_ERROR` (סיסמה קצרה מ-6 תווים, או זהה לנוכחית).

### POST `/groups`

בקשה של **אורח** (בלי טוקן):

```json
{
  "groupName": "קופת ועד הכיתה",
  "manager": { "name": "דנה לוי", "email": "dana@example.com", "password": "MyPass123" },
  "members": [
    { "name": "יוסי כהן", "email": "yossi@example.com", "password": "Temp1234" },
    { "name": "מיכל אברהם", "email": "michal@example.com", "password": "Temp1234" }
  ]
}
```

בקשה של **משתמש מחובר** (עם טוקן): אותו דבר בלי השדה `manager`. המחובר הוא המנהל.

ב-`members` שולחים את החברים **חוץ מהמנהל**, ולפחות 2.

תשובה 201:

```json
{
  "group": { "id": 1, "name": "קופת ועד הכיתה", "isActive": true, "createdAt": "...", "closedAt": null },
  "members": [
    { "userId": 2, "name": "יוסי כהן", "email": "yossi@example.com", "isNewUser": true },
    { "userId": 3, "name": "מיכל אברהם", "email": "michal@example.com", "isNewUser": false }
  ],
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

- `token` חוזר רק לאורח. שומרים אותו, והמשתמש כבר מחובר.
- `isNewUser: false` פירושו שהמייל כבר היה רשום: המשתמש שויך לקבוצה, והשם והסיסמה שהוקלדו לא נשמרו.
  כדאי להציג למנהל הודעה על כך.

שגיאות: 400 `VALIDATION_ERROR` (פחות מ-2 חברים, מייל כפול, מייל המנהל ברשימה), 400 `MANAGER_REQUIRED`,
400 `MANAGER_IN_MEMBERS`, 409 `EMAIL_EXISTS_LOGIN_REQUIRED` (מציגים הודעה עם קישור לכניסה).

### GET `/groups`

תשובה 200:

```json
{
  "groups": [
    {
      "id": 1, "name": "קופת ועד הכיתה", "isActive": true,
      "createdAt": "...", "closedAt": null, "role": "manager", "myBalance": 8.63
    }
  ]
}
```

כולל קבוצות סגורות (`isActive: false`). מציגים אותן עם הסימון "סגורה".

### GET `/groups/:groupId`

תשובה 200:

```json
{
  "group": {
    "id": 1, "name": "קופת ועד הכיתה", "isActive": true, "createdAt": "...", "closedAt": null,
    "managerName": "דנה לוי", "membersCount": 4, "role": "manager",
    "myBalance": 8.63, "fundBalance": 14.5, "totalDeposited": 180
  }
}
```

- `role` – לפיו מחליטים אילו כפתורים להציג.
- `fundBalance` – יתרת הקופה. שלילי פירושו שחסר כסף בקופה.
- `isActive: false` – מסתירים את כל כפתורי הפעולה.

### POST `/groups/:groupId/close`

1. שולחים בלי גוף (או `{ "force": false }`).
2. אם כל היתרות 0, חוזר 200 והקבוצה נסגרה.
3. אם לא, חוזר 409 `BALANCES_NOT_ZERO`:
   ```json
   {
     "error": {
       "code": "BALANCES_NOT_ZERO",
       "message": "יש חברים שהיתרה שלהם אינה 0. לסגור בכל זאת?",
       "details": {
         "fundBalance": -30,
         "members": [{ "userId": 4, "name": "אבי מזרחי", "balance": -30 }]
       }
     }
   }
   ```
4. מציגים חלון אישור עם הנתונים מ-`details`.
5. אם המנהל מאשר, שולחים שוב עם `{ "force": true }`.

### POST `/groups/:groupId/leave`

בלי גוף. תשובה 204 בלי תוכן. אחריה מעבירים לעמוד בחירת קבוצה.
שגיאות: 403 `MANAGER_CANNOT_LEAVE`, 409 `BALANCE_NOT_ZERO`, 409 `MIN_MEMBERS`.

### GET `/groups/:groupId/members`

פרמטרים (לא חובה): `search`, ולמנהל גם `balanceStatus` עם הערכים `debt` / `zero` / `credit`.

תשובה 200 ל**מנהל**:

```json
{
  "members": [
    { "userId": 1, "name": "דנה לוי", "email": "dana@example.com", "role": "manager", "balance": 8.63, "joinedAt": "..." }
  ]
}
```

תשובה 200 ל**חבר**:

```json
{ "members": [{ "name": "דנה לוי", "role": "manager" }, { "name": "יוסי כהן", "role": "member" }] }
```

חבר רגיל לא מקבל מייל, יתרה או מזהה. המידע הזה לא מגיע לדפדפן בכלל.

### POST `/groups/:groupId/members`

בקשה: `{ "name": "נועה פרץ", "email": "noa@example.com", "password": "Temp1234" }`

תשובה 201: `{ "member": { "userId", "name", "email", "isNewUser", "role": "member", "balance": 0 } }`.
שגיאות: 409 `ALREADY_MEMBER`.

### DELETE `/groups/:groupId/members/:userId`

תשובה 204. שגיאות: 400 `CANNOT_REMOVE_MANAGER`, 404 `MEMBER_NOT_FOUND`,
409 `BALANCE_NOT_ZERO` (ב-`details.balance` היתרה של החבר), 409 `MIN_MEMBERS`.

### POST `/groups/:groupId/members/:userId/reset-password`

בקשה: `{ "newPassword": "Temp5678" }` – תשובה 204.
החבר יידרש להחליף את הסיסמה בכניסה הבאה.

### GET `/groups/:groupId/transactions`

פרמטרים, כולם לא חובה:

| פרמטר | ערכים | הסבר |
| --- | --- | --- |
| `search` | טקסט | חיפוש בהערה. למנהל גם בשם החבר |
| `type` | `deposit` / `withdraw` | |
| `category` | `meeting` / `equipment` / `general` / `other` | |
| `userId` | מספר | מנהל בלבד: תנועות של חבר מסוים |
| `mine` | `true` | רק התנועות שלי |
| `from`, `to` | תאריך, למשל `2026-10-01` | טווח תאריכים |
| `sort` | `newest` (ברירת מחדל) / `oldest` | |
| `page`, `pageSize` | מספרים. ברירת מחדל 1 ו-50 | |

דוגמה: `/groups/1/transactions?type=deposit&category=meeting&sort=oldest`

תשובה 200:

```json
{
  "summary": { "totalDeposited": 180, "fundBalance": 14.5 },
  "page": 1,
  "pageSize": 50,
  "total": 2,
  "items": [
    {
      "id": 12, "type": "deposit", "amount": 50, "isShared": false,
      "category": "meeting", "note": "גבייה למסיבת סוף שנה",
      "fundBalanceAfter": 130, "createdAt": "2026-10-01T09:30:00.000Z",
      "isMine": true, "userId": 1, "userName": "דנה לוי", "recordedByName": "דנה לוי"
    },
    {
      "id": 13, "type": "withdraw", "amount": 120, "isShared": true,
      "category": "meeting", "note": "השכרת אולם למסיבה",
      "fundBalanceAfter": 10, "createdAt": "2026-10-03T12:00:00.000Z",
      "isMine": false, "userId": null, "userName": null, "recordedByName": null
    }
  ]
}
```

- `summary` – סך כל ההפקדות מפתיחת הקבוצה, ויתרת הקופה. לא מושפע מהסינון.
- `total` – מספר התנועות שעונות על הסינון, לצורך דפדוף.
- **מנהל** מקבל `userName` בכל תנועה.
- **חבר** מקבל `userName` רק כש-`isMine` הוא `true`. בשאר התנועות הערך `null`,
  ומציגים טקסט כללי, למשל "תשלום לקופה: 50 ₪".
- `recordedByName` – מי רשם את התנועה. שונה מ-`userName` כשהמנהל רשם אותה עבור החבר.

### POST `/groups/:groupId/transactions`

בקשה:

```json
{ "type": "withdraw", "amount": 120, "isShared": true, "category": "meeting", "note": "השכרת אולם" }
```

| שדה | חובה | הסבר |
| --- | --- | --- |
| `type` | כן | `deposit` או `withdraw` |
| `amount` | כן | מספר חיובי, עד שתי ספרות אחרי הנקודה |
| `isShared` | לא | רק במשיכה. `true` = הוצאה של הקבוצה שמתחלקת בין כולם. ברירת מחדל `false` |
| `category` | לא | ברירת מחדל `general` |
| `note` | לא | עד 300 תווים |

תשובה 201: `{ "transaction": { ... } }` באותו מבנה כמו בהיסטוריה.
אחרי הצלחה היתרות השתנו, ולכן טוענים מחדש את `GET /groups/:groupId`.

### POST `/groups/:groupId/transactions/bulk`

המסך של המנהל: רשימת חברים עם שדה סכום לכל אחד. שולחים רק חברים שהוזן להם סכום.

```json
{
  "type": "deposit",
  "category": "meeting",
  "note": "גבייה למסיבת סוף שנה",
  "items": [
    { "userId": 1, "amount": 50 },
    { "userId": 2, "amount": 30 }
  ]
}
```

תשובה 201: `{ "transactions": [ ... ] }` – תנועה אחת לכל חבר.
הכול נשמר יחד או לא נשמר בכלל. שגיאות: 400 `MEMBER_NOT_FOUND`.

### PATCH `/groups/:groupId/transactions/:transactionId`

בקשה: `{ "category": "equipment", "note": "קניית כדורים" }` (אחד מהשדות לפחות).
תשובה 200: `{ "transaction": { ... } }`. אי אפשר לשנות סכום או סוג.

### GET `/groups/:groupId/messages`

פרמטרים (לא חובה): `box` עם הערכים `all` / `inbox` / `sent`, ו-`unreadOnly=true`.

תשובה 200:

```json
{
  "unreadCount": 1,
  "items": [
    {
      "id": 4, "content": "שלום לכולם! אוספים 50 ש\"ח.", "toAll": true,
      "createdAt": "2026-10-01T09:30:00.000Z", "direction": "received",
      "sender": { "id": 1, "name": "דנה לוי" }, "isRead": false, "recipients": null
    }
  ]
}
```

- `direction` – `sent` (שלחתי) או `received` (קיבלתי).
- `isRead` – רק בהודעה שקיבלתי. לפיו מציגים את הסימון "חדש".
- `recipients` – רק בהודעה ששלחתי: רשימת הנמענים, ומי כבר פתח (`readAt`).
- `unreadCount` – מתאים לתג מספר ליד הקישור להודעות.

### POST `/groups/:groupId/messages`

| מי | מה שולחים |
| --- | --- |
| מנהל, לכולם | `{ "content": "...", "toAll": true }` |
| מנהל, לנבחרים | `{ "content": "...", "recipientIds": [2, 4] }` |
| חבר | `{ "content": "..." }` – נשלח למנהל הקבוצה |

תשובה 201: `{ "message": { ... } }`. שגיאות: 400 `RECIPIENTS_REQUIRED`, 403 `MANAGER_ONLY`.
את ה-`userId` של החברים לבחירת נמענים המנהל מקבל מ-`GET .../members`.

### POST `/groups/:groupId/messages/:messageId/read`

בלי גוף. תשובה 204. קוראים לה כשהמשתמש פותח הודעה שקיבל.

## 8. מה להציג לכל תפקיד

את התפקיד לוקחים מ-`role` שב-`GET /groups/:groupId`. הוא שונה מקבוצה לקבוצה.

| מה מוצג | מנהל | חבר |
| --- | --- | --- |
| כפתור סגירת הקבוצה | כן | לא |
| כפתור יציאה מהקבוצה | לא | כן |
| טבלת חברים עם מייל ויתרה | כן | לא, שמות בלבד |
| הוספה / הסרה / איפוס סיסמה | כן | לא |
| מסך רישום מרוכז | כן | לא |
| סינון היסטוריה לפי חבר | כן | לא, רק "התנועות שלי" |
| עריכת תנועה | כל תנועה | רק כש-`isMine` הוא `true` |
| בחירת נמענים להודעה | כן | לא |

הסתרת כפתורים היא לנוחות המשתמש בלבד. ההגנה האמיתית בשרת:
גם אם חבר ישלח בקשה של מנהל, הוא יקבל 403.

## 9. שדות חובה וכללי קלט לטפסים

| שדה | כללים |
| --- | --- |
| מייל | חובה, כתובת תקינה |
| סיסמה | חובה, 6 עד 72 תווים |
| שם | חובה, 2 עד 60 תווים |
| שם קבוצה | חובה, 2 עד 60 תווים |
| חברים ביצירת קבוצה | לפחות 2 חוץ מהמנהל, בלי מייל כפול, ובלי מייל המנהל |
| סכום | חובה, מספר גדול מ-0, עד שתי ספרות אחרי הנקודה, עד 1,000,000 |
| הערה | לא חובה, עד 300 תווים |
| תוכן הודעה | חובה, 1 עד 1000 תווים |

כדאי לבדוק את אותם כללים גם בטופס (React Hook Form), כדי שהמשתמש יקבל הודעה מיד.
השרת בודק אותם שוב בכל מקרה.

## 10. משתמשי דוגמה לבדיקות

אם הופעלו נתוני הדוגמה (ראו README), אפשר להתחבר עם:

| מייל | מתאים לבדיקת |
| --- | --- |
| `dana@example.com` | מנהלת בקבוצה 1 וחברה בקבוצה 2: עמוד בחירת קבוצה ותפקיד שונה בכל קבוצה |
| `yossi@example.com` | ההפך: חבר בקבוצה 1 ומנהל בקבוצה 2 |
| `michal@example.com` | חברה בקבוצה אחת בלבד: מעבר ישיר לאזור האישי |
| `avi@example.com` | חבר עם חוב, והודעה פרטית מהמנהלת |
| `noa@example.com` | סיסמה זמנית: מעבר כפוי לשינוי סיסמה |

הסיסמה של כולם היא הערך שהוגדר במשתנה הסביבה `SEED_DEMO_PASSWORD`.
