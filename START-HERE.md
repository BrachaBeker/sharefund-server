# מתחילים כאן – איך מעלים את השרת לאינטרנט

המדריך מיועד למי שעוד לא העלתה שרת לאינטרנט. עובדים לפי הסדר: GitHub, מסד נתונים, Render, בדיקה.
בסוף יהיה לך שרת עם כתובת קבועה, ש-React יכול לדבר איתו.

**מה צריך:** דפדפן, כתובת מייל, וקובץ ה-ZIP של הפרויקט. הכול בחינם ובלי כרטיס אשראי.

**הערה חשובה על שמות כפתורים:** האתרים GitHub, Supabase ו-Render משנים את העיצוב שלהם מדי פעם.
לא יכולתי לבדוק את המסכים שלהם בזמן כתיבת המדריך, ולכן שמות הכפתורים כאן הם לפי מה שהיה ידוע לי.
אם כפתור נקרא אצלך קצת אחרת, חפשי את הכפתור עם המשמעות הקרובה ביותר.
לעומת זאת, **הפקודות, שמות המשתנים והערכים** במדריך מדויקים, כי הם שייכים לפרויקט הזה.

---

## חלק א – GitHub

GitHub הוא המקום שבו הקוד נשמר. Render ייקח את הקוד משם.

1. **פתיחת חשבון.** נכנסים ל-`https://github.com`, לוחצים על Sign up, וממלאים מייל, סיסמה ושם משתמש.
2. **יצירת מאגר (Repository).** אחרי הכניסה לוחצים על סימן ה-`+` למעלה ובוחרים New repository.
   - ב-Repository name כותבים: `sharefund-server`
   - בוחרים Public או Private (שניהם עובדים).
   - **לא** מסמנים הוספה של README, של `.gitignore` או של license. המאגר צריך להיות ריק.
   - לוחצים Create repository.
3. **חילוץ ה-ZIP.** במחשב, לוחצים קליק ימני על קובץ ה-ZIP ובוחרים "חלץ הכול". נוצרת תיקייה בשם `backend-project`.
4. **העלאת הקבצים דרך הדפדפן.**
   - בעמוד המאגר הריק לוחצים על הקישור uploading an existing file.
   - פותחים את התיקייה `backend-project`, מסמנים את **כל מה שבתוכה** (Ctrl+A) וגוררים לחלון הדפדפן.
     גוררים את התוכן של התיקייה ולא את התיקייה עצמה, כדי ש-`package.json` יהיה בשורש המאגר.
   - מחכים שכל הקבצים ייטענו, ולוחצים Commit changes.
5. **בדיקה.** בעמוד המאגר צריכים להופיע התיקיות `src`, `prisma`, `tests`, `docs`,
   והקבצים `package.json`, `package-lock.json`, `render.yaml`, `README.md`.
   - נכנסים לתיקייה `prisma` ובודקים שיש בה תיקיית `migrations` עם קובץ `migration.sql` בתוכה.
   - **אסור** שיופיעו במאגר התיקייה `node_modules` או קובץ בשם `.env`.

> **אם קבצים שמתחילים בנקודה לא עלו** (`.gitignore`, `.env.example`): זה קורה כי Windows מסתיר אותם.
> השרת יעבוד גם בלעדיהם. אפשר להוסיף אותם ידנית ב-GitHub דרך Add file ואז Create new file.

---

## חלק ב – מסד נתונים (PostgreSQL)

השרת שומר את המידע במסד נתונים מסוג PostgreSQL. המסד יושב אצל ספק נפרד מהשרת,
כך שאפשר להחליף אחד מהם בלי לגעת בשני. המדריך משתמש ב-Supabase, שיש לו מסלול חינמי.

1. **פתיחת חשבון.** נכנסים ל-`https://supabase.com`, לוחצים Start your project,
   ונרשמים (הכי קל עם חשבון ה-GitHub שפתחת).
2. **יצירת מסד.** לוחצים New project.
   - Name: `sharefund`
   - Database Password: לוחצים על Generate a password, **ומעתיקים את הסיסמה לקובץ במחשב**. לא יראו אותה שוב.
   - Region: בוחרים אזור באירופה (הכי קרוב לישראל).
   - לוחצים Create new project ומחכים דקה או שתיים.
3. **קבלת כתובת החיבור (Connection String).** לוחצים על הכפתור Connect בראש העמוד.
   - מחפשים את האפשרות **Session pooler** ומעתיקים את הכתובת שלה.
     היא נראית בערך כך:
     `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
   - **חשוב לבחור Session pooler ולא Direct connection.** החיבור הישיר של Supabase עובד רק ברשת מסוג IPv6,
     ו-Render לא תומך בה. עם החיבור הישיר השרת לא יצליח להתחבר.
   - מחליפים בכתובת את `[YOUR-PASSWORD]` בסיסמה ששמרת (בלי הסוגריים המרובעים).
4. **שמירה בטוחה.** הכתובת הזאת היא כמו מפתח לכל המידע.
   - שומרים אותה בקובץ במחשב בלבד.
   - לא שמים אותה ב-GitHub, לא שולחים בוואטסאפ ולא מדביקים בקוד.
5. **חיבור השרת למסד** נעשה בחלק הבא: מדביקים את הכתובת ב-Render במשתנה בשם `DATABASE_URL`.

> **טוב לדעת:** לפי מה שידוע לי, במסלול החינמי Supabase משהה פרויקט שלא נגעו בו כשבוע.
> אם זה קרה, נכנסים ל-Supabase ולוחצים על הכפתור שמחזיר את הפרויקט לפעולה (Restore / Resume).
>
> **למה לא המסד של Render?** לפי מה שידוע לי, מסד PostgreSQL חינמי ב-Render נמחק אחרי כחודש.
> לכן המסד נמצא אצל ספק אחר. כל ספק PostgreSQL אחר (למשל Neon) יעבוד באותה צורה: רק מחליפים את הכתובת.

---

## חלק ג – Render

Render מריץ את השרת ונותן לו כתובת באינטרנט.

1. **פתיחת חשבון.** נכנסים ל-`https://render.com`, לוחצים Get Started, ונרשמים עם חשבון ה-GitHub.
2. **חיבור GitHub.** בהרשמה עם GitHub מתבקשים לאשר ל-Render גישה למאגרים. מאשרים
   (אפשר לתת גישה רק למאגר `sharefund-server`).
3. **יצירת Web Service.** בלוח הבקרה לוחצים New ובוחרים Web Service.
4. **בחירת המאגר.** בוחרים את `sharefund-server` מהרשימה ולוחצים Connect.
5. **הגדרות Build ו-Start.** ממלאים בדיוק כך:

   | שדה | ערך |
   | --- | --- |
   | Name | `sharefund-server` |
   | Language / Runtime | `Node` |
   | Branch | `main` |
   | Root Directory | משאירים ריק |
   | Build Command | `npm ci --include=dev && npx prisma generate && npm run build` |
   | Start Command | `npm run start:prod` |
   | Instance Type | `Free` |

6. **משתני סביבה (Environment Variables).** באותו עמוד, באזור Environment Variables, מוסיפים:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | הכתובת מ-Supabase, עם הסיסמה בפנים |
   | `JWT_SECRET` | לוחצים על Generate כדי לקבל ערך אקראי. אם אין כפתור כזה, מקלידים מחרוזת אקראית של 40 תווים |
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `22` |
   | `CORS_ORIGIN` | כתובת אתר ה-React שלך. כל עוד אין, כותבים `http://localhost:5173` |

   רוצה משתמשי דוגמה לבדיקה? מוסיפים גם:

   | Key | Value |
   | --- | --- |
   | `SEED_DEMO_DATA` | `true` |

   משתמשי הדוגמה והסיסמאות שלהם מופיעים ב-README.

7. **Prisma Migrations.** אין מה לעשות ידנית. הפקודה `npm run start:prod` מריצה
   `prisma migrate deploy` בכל עליית שרת, והיא יוצרת את הטבלאות ב-Supabase בפעם הראשונה.
8. **Deploy.** לוחצים Create Web Service (או Deploy). Render מתקין, בונה ומריץ. זה לוקח כמה דקות,
   ואפשר לעקוב בלשונית Logs.
9. **בדיקה שהשרת פעיל.** כשמופיע הסטטוס Live, ובלוגים מופיעה השורה
   `ShareFund server is running on port ...`, השרת באוויר.
   הכתובת שלו מופיעה בראש העמוד, בצורה `https://sharefund-server-xxxx.onrender.com`.

> **טוב לדעת:** במסלול החינמי Render מרדים את השרת אחרי כרבע שעה בלי שימוש.
> הבקשה הראשונה אחרי הפסקה לוקחת עד כדקה, ואחריה הכול מהיר. זה לא באג.
>
> **דרך מקוצרת:** הקובץ `render.yaml` שבפרויקט מכיל את כל ההגדרות האלה.
> אפשר לבחור ב-Render את New ואז Blueprint, לבחור את המאגר, ולמלא רק את `DATABASE_URL` ואת `CORS_ORIGIN`.
>
> **אם השרת נמצא בתיקיית משנה במאגר** (למשל מאגר אחד עם `client` ו-`server`):
> כותבים ב-Root Directory את שם התיקייה, למשל `server`.

---

## חלק ד – בדיקה

בכל הכתובות מחליפים את `https://YOUR-SERVER.onrender.com` בכתובת האמיתית של השרת.

1. **בדיקת תקינות.** פותחים בדפדפן את `https://YOUR-SERVER.onrender.com/api/health`.
   צריך להופיע: `{"status":"ok","database":"ok"}`.
2. **Swagger.** פותחים את `https://YOUR-SERVER.onrender.com/api-docs`. מופיעה רשימה של כל כתובות השרת.
3. **התחברות.** פותחים את `POST /api/auth/login`, לוחצים Try it out, וממלאים:
   ```json
   { "email": "123@gmail.com", "password": "123123" }
   ```
   לוחצים Execute. (בלי נתוני דוגמה: קודם יוצרים קבוצה ב-`POST /api/groups`, ואז מתחברים עם פרטי המנהל.)
4. **קבלת הטוקן.** בתשובה מופיע שדה `token`. מעתיקים את הערך שלו, בלי המירכאות.
5. **Authorize.** לוחצים על הכפתור Authorize בראש העמוד, מדביקים את הטוקן, ולוחצים Authorize ואז Close.
6. **קריאה מוגנת.** מריצים את `GET /api/groups`. חוזרת רשימת הקבוצות של מנהל הדמו, עם קוד 200.
   - בלי Authorize אותה קריאה מחזירה 401.
   - דנה חברה רגילה בקבוצה 2. `POST /api/groups/2/close` מחזיר לה 403.
7. **הוספת רשומה.** מריצים את `POST /api/groups/{groupId}/transactions` עם `groupId` שווה 1 ועם:
   ```json
   { "type": "deposit", "amount": 25, "category": "general", "note": "בדיקה" }
   ```
   חוזר קוד 201 עם התנועה החדשה.
8. **שליפה מהמסד.** מריצים את `GET /api/groups/{groupId}/transactions` עם `groupId` שווה 1.
   התנועה שהוספת מופיעה ראשונה. אפשר לראות אותה גם ב-Supabase, ב-Table Editor, בטבלה `transactions`
   (שם הסכום מופיע באגורות: 2500).

---

## חלק ה – פתרון תקלות

| התקלה | מה לבדוק ואיך לתקן |
| --- | --- |
| **Build Failed** | פותחים את הלוגים ב-Render וקוראים את השורה האדומה הראשונה. הסיבות הנפוצות: `package.json` לא בשורש המאגר (העלית את התיקייה במקום את התוכן שלה; מתקנים ב-Root Directory), חסר `package-lock.json`, או Build Command שהועתק חלקית. |
| **`DATABASE_URL` שגוי** | בלוגים מופיע `Can't reach database server` או `Authentication failed`. בודקים שהועתקה הכתובת של Session pooler, שהסיסמה הוחלפה ושלא נשארו סוגריים מרובעים. אם בסיסמה יש תווים מיוחדים כמו `@` או `#`, יוצרים ב-Supabase סיסמה חדשה מאותיות וספרות בלבד. |
| **בעיית Prisma** | `The table does not exist`: ה-migrations לא רצו. בודקים שה-Start Command הוא `npm run start:prod` ושהתיקייה `prisma/migrations` קיימת ב-GitHub. `Prisma Client did not initialize`: חסר `npx prisma generate` ב-Build Command. |
| **`JWT_SECRET` חסר** | בלוגים מופיע `Invalid environment variables` ו-`JWT_SECRET`. מוסיפים את המשתנה, באורך 32 תווים לפחות, ו-Render יעלה מחדש. |
| **שגיאת CORS** | בדפדפן, בקונסול של אתר ה-React, מופיעה שגיאה עם המילה CORS. מעדכנים את `CORS_ORIGIN` לכתובת המדויקת של אתר ה-React, כולל `https://` ובלי `/` בסוף. לכמה כתובות מפרידים בפסיק. |
| **401** | אין טוקן, או שפג תוקפו (אחרי שעתיים). מתחברים שוב ושולחים את הטוקן החדש בכותרת `Authorization: Bearer ...`. |
| **403** | הטוקן תקין אבל אין הרשאה. בודקים את `code` בתשובה: `NOT_A_MEMBER` (לא חברה בקבוצה), `MANAGER_ONLY` (פעולה של מנהל), `PASSWORD_CHANGE_REQUIRED` (צריך קודם להחליף סיסמה זמנית). |
| **Swagger לא נפתח** | בודקים שהכתובת היא `/api-docs` ולא `/api/docs`. אם גם `/api/health` לא נפתח, השרת עצמו לא עלה: בודקים את הלוגים. |
| **השרת לא עולה** | הסטטוס ב-Render נשאר Deploying או Failed. קוראים את הלוגים: כמעט תמיד זה משתנה סביבה חסר או `DATABASE_URL` שגוי. בודקים גם שהפרויקט ב-Supabase לא מושהה. |
| **הבקשה הראשונה איטית מאוד** | השרת החינמי נרדם אחרי כרבע שעה. מחכים עד דקה ומנסים שוב. |
| **נתוני הדוגמה לא נוצרו** | צריך `SEED_DEMO_DATA=true`. בלוגים מופיעה שורה שמתחילה ב-`Seed`. |

---

## ומה עכשיו?

השרת באוויר. כדי לחבר אליו את צד ה-React קוראים את [FRONTEND-API-GUIDE.md](FRONTEND-API-GUIDE.md).
אחרי שאתר ה-React יעלה לאינטרנט, חוזרים ל-Render ומעדכנים את `CORS_ORIGIN` לכתובת שלו.
