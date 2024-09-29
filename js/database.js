const sqlite3 = require('sqlite3').verbose();

// إنشاء قاعدة بيانات أو فتحها
let db = new sqlite3.Database('./database/MegaBot.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});
function deleteOldProxies(callback) {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const cutoffDate = oneMonthAgo.toISOString().split('T')[0]; // التنسيق YYYY-MM-DD

    db.run(`DELETE FROM proxies WHERE purchase_date < ?`, [cutoffDate], function(err) {
        if (err) {
            return callback(err);
        }
        callback(null);
    });
}

function updateCredit(userid, newCredit, callback) {
    db.run(`UPDATE users SET credit = ? WHERE userid = ?`, [newCredit, userid], function(err) {
        if (err) {
            return callback(err);
        }
        callback(null);
    });
}
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE,        -- رقم عملية التحويل (فريد)
        user_id INTEGER,                   -- معرّف المستخدم
        amount REAL,                       -- مبلغ التحويل
        currency TEXT DEFAULT 'USDT',      -- العملة (مثال: USDT)
        status TEXT DEFAULT 'pending',     -- حالة العملية (pending, completed, failed)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- تاريخ إدخال العملية
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- تاريخ آخر تحديث
    )`, (err) => {
        if (err) {
            console.error(err.message);
        } else {
            console.log('Transactions table created or already exists.');
        }
    });
});

// إنشاء جدول المستخدمين
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        userid INTEGER UNIQUE,
        counter INTEGER DEFAULT 0,
        credit REAL DEFAULT 0.0,
        language VARCHAR DEFAULT 'ar',
        admin bool DEFAULT false
    )`, (err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Users table created or already exists.');
    });
});
function setAdminStatus(userId, isAdmin, callback) {
    db.run(`UPDATE users SET admin = ? WHERE userid = ?`, [isAdmin, userId], function(err) {
        if (err) {
            return callback(err);
        }
        callback(null, this.changes); // إرجاع عدد الصفوف المتأثرة
    });
}

// إنشاء جدول الدعوات
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userid INTEGER,
        invited_userid INTEGER UNIQUE
    )`, (err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Invitations table created or already exists.');
    });
});

// إنشاء جدول شراء البروكسيات مع اسم المستخدم وكلمة المرور
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS proxy_purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        proxy_type TEXT,
        quantity INTEGER,
        price REAL,
        purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        proxy_username TEXT UNIQUE,
        proxy_password TEXT
    )`, (err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Proxy purchases table created or already exists.');
    });
});
const getPurchasesInLastDay = (callback) => {
    const query = `
        SELECT user_id, proxy_type, quantity, price, purchase_date, proxy_username, 
        (SELECT SUM(price) FROM proxy_purchases WHERE purchase_date >= datetime('now', '-1 day')) AS total_sum
        FROM proxy_purchases 
        WHERE purchase_date >= datetime('now', '-1 day')
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            return callback(err, null);
        }
        return callback(null, rows);
    });
};
const getPurchasesSinceBotStart = (callback) => {
    const query = `
        SELECT user_id, proxy_type, quantity, price, purchase_date, proxy_username, 
        (SELECT SUM(price) FROM proxy_purchases) AS total_sum
        FROM proxy_purchases 
    `;
    db.all(query, (err, rows) => {
        if (err) {
            return callback(err, null);
        }
        return callback(null, rows);
    });
};


db.serialize(() => 
    {db.run(`create TABLE IF NOT EXISTS payeer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL,
        payeer_id INTEGER UNIQUE
    )`, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('Payeer  table created or already exists.');
        }
    });
});
function addPayeerRecord(amount, payeer_id, callback) {
    payeer_id = parseInt(payeer_id);
    // التحقق مما إذا كان الـ payeer_id موجودًا مسبقًا
    db.get('SELECT * FROM payeer WHERE payeer_id = ?', [payeer_id], (err, row) => {
        if (err) {
            console.error('Error checking existing payeer_id:', err.message);
            callback(err);  // إرسال الخطأ إلى النداء العكسي
            return;
        } 
        if (row) {
            // إذا كان الـ payeer_id موجودًا، تجاهل عملية الإدخال
            console.log('Record with this payeer_id already exists.');
            callback(null, null);  // إرسال null كإشارة إلى أنه لم يتم الإدخال
        } else {
            // إدخال البيانات الجديدة في الجدول
            db.run('INSERT INTO payeer (amount, payeer_id) VALUES (?, ?)', [amount, payeer_id], function(err) {
                if (err) {
                    console.error('Error inserting data:', err.message);
                    callback(err);  // إرسال الخطأ إلى النداء العكسي
                } else {
                    console.log(`A row has been inserted with rowid ${this.lastID}`);
                    callback(null, this.lastID);  // إرسال معرف السجل الجديد إلى النداء العكسي
                }
            });
        }
    });
}

// إدخال بيانات المستخدم
function insertUser(username, userid) {
    db.run(`INSERT INTO users (username, userid) VALUES (?, ?)`, [username, userid], function(err) {
        if (err) {
            return console.error(err.message);
        }
        console.log(`A row has been inserted with rowid ${this.lastID}`);
    });
}
function updateCreditincrement(userid, amount, callback) {
    db.run(`UPDATE users SET credit = credit + ? WHERE userid = ?`, [amount, userid], function(err) {
        if (err) {
            return callback(err);
        }
        callback(null, this.changes); // this.changes يعيد عدد الصفوف المتأثرة
    });
}
// إدخال بيانات الدعوة
function insertInvite(userid, invited_userid) {
    
    db.run(`INSERT INTO invitations (userid, invited_userid) VALUES (?, ?)`, [userid, invited_userid], function(err) {
        if (err) {
            return console.error(err.message);
        }
        console.log(`A row has been inserted with rowid ${this.lastID}`);
    });
}

// زيادة عدد الدعوات للمستخدم
function incrementCounter(useridinv, userid) {
    db.get(`SELECT 1 FROM invitations WHERE invited_userid = ?`, [useridinv], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        
        if (!row) { // إذا كان `row` غير موجود، قم بزيادة العداد
            db.run(`UPDATE users SET counter = counter + 1 WHERE userid = ?`, [userid], function(err) {
                if (err) {
                    return console.error(err.message);
                }
                console.log(`Counter for user with userid ${userid} incremented by 1.`);
            });
        }
    });
}

// استرجاع معلومات المستخدم
function get_user_info_all(callback) {
    db.all(`SELECT * FROM users`, (err, rows) => {
        if (err) {
            return callback(err, null);
        }
        if (rows.length > 0) {
            return callback(null, rows);  // إرجاع جميع المستخدمين
        } else {
            return callback(null, null);  // إذا لم يتم العثور على مستخدمين
        }
    });
}


function get_user_info(userid, callback) {
    db.get(`SELECT counter, credit FROM users WHERE userid = ?`, [userid], (err, row) => {
        if (err) {
            return callback(err, null);
        }
        if (row) {
            return callback(null, row);
        } else {
            return callback(null, null);
        }
    });
}

// إدخال عملية شراء بروكسي مع اسم المستخدم وكلمة المرور
function insertProxyPurchase(userId, proxyType,  price, proxyUsername, proxyPassword, callback) {
    const sql = `INSERT INTO proxy_purchases (user_id, proxy_type, quantity, price, proxy_username, proxy_password) VALUES (?, ?, ?, ?, ?, ?)`;
   //const purchaseDateTime = new Date().toISOString().replace('T', ' ').split('.')[0];
    db.run(sql, [userId, proxyType, proxyType, price, proxyUsername, proxyPassword], function (err) {
        if (err) {
            return callback(err);
        }
        callback(null, this.lastID);
    });
}

// استرجاع المستخدمين والدعوات
function selectUser() {
    db.serialize(() => {
        db.each('SELECT * FROM users', (err, row) => {
            if (err) {
                console.error(err.message);
            }
            console.log(`${row.id}: ${row.username} - ${row.userid} - ${row.credit} - ${row.counter}`);
        });
        db.each('SELECT * FROM invitations', (err, row) => {
            if (err) {
                console.error(err.message);
            }
            console.log(`${row.id}: ${row.userid} - ${row.invited_userid}`);
        });
    });
}
function getUserProxies(userid, callback) {
    db.all(`SELECT id, proxy_username, proxy_password,purchase_date FROM proxy_purchases WHERE user_id = ?`, [userid], (err, rows) => {
        if (err) {
            return callback(err, null);
        }
        return callback(null, rows);
    });
}
//جلب معلومات الشخص الذي قام بالدعوة إلى البوت
function getUserIdFromInvitation(invitedUserId, callback) {
    db.get(`SELECT userid FROM invitations WHERE invited_userid = ?`, [invitedUserId], (err, row) => {
        if (err) {
            return callback(err, null);
        }
        if (row) {
            return callback(null, row.userid);
        } else {
            return callback(null, null); // لا يوجد سجل بهذا invited_userid
        }
    });
}
function updatelanguage(userid, language, callback) {
    db.run(`UPDATE users SET language = ? WHERE userid = ?`, [language, userid], function(err) {
        if (err) {
            return callback(err);
        }
        callback(null, this.changes); // this.changes يعيد عدد الصفوف المتأثرة
    });
}
function getUserLanguage(userId, callback) {
    db.get(`SELECT language FROM users WHERE userid = ?`, [userId], (err, row) => {
        if (err) {
            return callback(err, null);
        }
        if (row) {
            return callback(null, row.language);
        } else {
            return callback(null, null); // لا يوجد سجل بهذا invited_userid
        }
    });
}
function checkTransactionInDatabase(transactionId) {
    
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM transactions WHERE transaction_id = ?`;
        db.get(query, [transactionId], (err, row) => {
            if (err) {
                console.error("Error checking transaction:", err);
                return reject(err); // إرجاع خطأ
            }
            resolve(!!row); // إرجاع true إذا كانت العملية موجودة، أو false إذا لم تكن
        });
    });
}
function getUserStatus(userId, callback) {
    db.get(`SELECT admin FROM users WHERE userid = ?`, [userId], (err, row) => {
        if (err) {
            return callback(err, null);
        }
        if (row) {
            const isAdmin = row.admin === 1; // إذا كانت القيمة 1 فهذا يعني أنه مشرف
            return callback(null, isAdmin);
        } else {
            return callback(null, null); // لم يتم العثور على المستخدم
        }
    });
}
console.log(checkTransactionInDatabase("0xe64955096038713617007c1240d5ee715644ddc4ece8404b8b9cde416b6f94d1"));
// دالة لإدخال عملية التحويل الجديدة في قاعدة البيانات
function insertTransactionIntoDatabase(transactionId,user_id,amount) {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO transactions (transaction_id, user_id,amount) VALUES (?,?,?)`;
        db.run(query, [transactionId,user_id,amount], function (err) {
            if (err) {
                console.error("Error inserting transaction:", err);
                return reject(err); // إرجاع خطأ
            }
            resolve(this.lastID); // إرجاع معرف العملية المدخلة
        });
    });
}
let db1 = new sqlite3.Database('./database/message.db');
function checkTransferNumber(transferNumber, userId, callback) {
    // الاستعلام للتحقق من وجود رقم عملية التحويل في قاعدة البيانات
    const query = "SELECT value FROM records WHERE numbertransfer = ? AND userid IS NULL";
    
    db1.get(query, [transferNumber], (err, row) => {
        if (err) {
            console.log('Error checking transfer number:', err);
            callback(false);  // خطأ أثناء التحقق
        } else if (row) {
            console.log("good row");
            // إذا كانت النتيجة موجودة (أي أن الرقم موجود في قاعدة البيانات)
            const updateQuery = "UPDATE records SET userid = ? WHERE numbertransfer = ?";
            db1.run(updateQuery, [userId, transferNumber], function (err) {
                if (err) {
                    console.log('Error updating record:', err);
                    console.error('Error updating transfer record:', err);
                    callback(false);  // خطأ أثناء التحديث
                } else {
                    console.log(row.value);
                    const numericValue = parseFloat(row.value);  // أو parseInt إذا كانت قيمة صحيحة
                    const result = numericValue / 15000;
                    callback(result);  // تم التحديث بنجاح وإرجاع قيمة "value"
                }
            });
        } else {
            console.log("no row");
            callback(false);  // لم يتم العثور على السجل
        }
    });
}
// تصدير الوظائف لاستخدامها في ملفات أخرى
module.exports = {
    insertUser,
    insertInvite,
    incrementCounter,
    selectUser,
    get_user_info,
    updateCredit,
    insertProxyPurchase,
    getUserProxies,
    updateCreditincrement,
    deleteOldProxies,
    getUserIdFromInvitation,
    getUserLanguage,
    updatelanguage,
    checkTransactionInDatabase,
    insertTransactionIntoDatabase,
    addPayeerRecord,
    checkTransferNumber,
    get_user_info_all,
    setAdminStatus,
    getUserStatus,
    getPurchasesInLastDay,
    getPurchasesSinceBotStart
};
