const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { exec } = require('child_process');
const crypto = require("crypto");
const Axios = require("axios");
const {
  insertUser, insertInvite, incrementCounter, getUserProxies, get_user_info,get_user_info_all,setAdminStatus,getUserStatus,getPurchasesInLastDay,
  updateCredit, updateCreditincrement, insertProxyPurchase, addPayeerRecord, checkTransferNumber,
  getPurchasesSinceBotStart,
  getUserIdFromInvitation, updatelanguage, getUserLanguage, insertTransactionIntoDatabase, checkTransactionInDatabase
} = require('./database');
const cron = require('node-cron');
const ACCESS_ID = "25DC70CF9112420491ECF206B990CD89";
const SECRET_KEY = "FBE6DF3FB0174A331FD30DBF41B2D985C6D4724867CED636";
const BASE_URL = "https://api.coinex.com";
const pricesFilePath = './prices/prices.json';
const ADMIN_ID = '893373977';
function writeJSONFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readJSONFile(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}
function getPriceValue(data, key) {
  return data[key] !== undefined ? data[key] : "Key not found";
}
function editPriceValue(data, key, newValue) {
  if (data[key] !== undefined) {
    data[key] = newValue;
    writeJSONFile(pricesFilePath, data); // Write updated data back to the file
    return `Value for ${key} updated to ${newValue}`;
  } else {
    return "Key not found";
  }
}
function createAuthorization(method, request_path, body_json, timestamp) {
  const text = method + request_path + body_json + timestamp;
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(text)
    .digest("hex")
    .toLowerCase();
}
const balance ={
  reply_markup: JSON.stringify({
    inline_keyboard: [
      [{ text: 'الرصيد خلال اليوم', callback_data: 'balance_day' }],
      [{ text: 'الرصيد خلال فترة عمل البوت', callback_data: 'balance_month' }]//,
    ]
  })
}
const axiosInstance = Axios.create({
  baseURL: BASE_URL,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36",
  },
  timeout: 10000,
});
function handleNetworkSelection(networkType, chatId, userId, language) {
  const networkMessage = {
    BEP20: "يرجى إرسال رقم عملية التحويل على عنوان BEP20:\n\n `0x7dd09ddfe0c0de5c77ca0b8cef64b212d0d757ec`",
    TRC20: 'يرجى إرسال رقم عملية التحويل على عنوان TRC20: TXk5h6k3JfMkZ3xH3skKbF7FR9m9TwhJLh',
  };

  const englishMessage = {
    BEP20: "Please send the transaction ID for BEP20 to this address: `0x7dd09ddfe0c0de5c77ca0b8cef64b212d0d757ec`",
    TRC20: 'Please send the transaction ID for TRC20 to this address: TXk5h6k3JfMkZ3xH3skKbF7FR9m9TwhJLh',
  };

  const message = (language === 'ar') ? networkMessage[networkType] : englishMessage[networkType];
  bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: [
        [{ text: (language === 'ar') ? '⬅️ العودة إلى السابق' : '⬅️ Back', callback_data: 'CoinEx' }]
      ]
    },
    parse_mode: `Markdown`
  });
  bot.once('message', (msg) => {
    const transactionId = msg.text;
    getDepositHistory(chatId, transactionId, userId, language);
  });
}
async function getDepositHistory(chatId, transactionId, userId, language) {
  const timestamp = Date.now();
  try {
    const res = await axiosInstance.get("/v2/assets/deposit-history", {
      headers: {
        "X-COINEX-KEY": ACCESS_ID,
        "X-COINEX-SIGN": createAuthorization("GET", "/v2/assets/deposit-history", "", timestamp),
        "X-COINEX-TIMESTAMP": timestamp,
      }
    });

    if (res.data.code === 0) {
      const depositHistory = res.data.data;
      const deposit = depositHistory.find(d => d.tx_id === transactionId);

      if (!deposit) {
        bot.sendMessage(chatId, (language === 'ar')
          ? 'لم يتم العثور على العملية في السجل.'
          : 'Transaction not found in the history.');
        return;
      }

      const value = deposit.amount;
      const isTransactionExists = await checkTransactionInDatabase(transactionId);

      if (isTransactionExists) {
        bot.sendMessage(chatId, (language === 'ar')
          ? 'رقم عملية التحويل مستخدم مسبقًا. يرجى التحقق من رقم العملية.'
          : 'The transaction ID has already been used. Please verify the transaction ID.');
      } else {
        await insertTransactionIntoDatabase(transactionId);
        updateCreditincrement(userId, value, (err, changes) => {
          if (err) {
            console.error('Error updating credit:', err.message);
          } else {
            console.log(`Credit updated for user ${userId}. Rows affected: ${changes}`);
            bot.sendMessage(chatId, (language == 'ar') ? 'تم شحن رصيدك بنجاح.' : 'Your balance has been successfully updated.');
            get_user_info(userId, (err, userInfo) => {
              if (err) {
                console.error('Error:', err);
                bot.sendMessage(chatId, (language == 'ar') ? 'حدث خطأ في استرجاع معلومات حسابك.' : 'There was an error retrieving your account information.');
              } else if (userInfo) {
                let credit = userInfo.credit !== undefined ? userInfo.credit : 0;
                let counter = userInfo.counter !== undefined ? userInfo.counter : 0;

                const response = (language == 'ar') ?
                  `رصيدك الحالي: ${credit} Credit\n\n` :
                  `Your current balance: ${credit} Credit\n\n`;
                bot.sendMessage(chatId, response).then(() => {
                  const keyboard1 = {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: (language === 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
                      ]
                    }
                  };
                  bot.sendMessage(chatId, (language == 'ar') ? 'اضغط هنا للرجوع إلى السابق' : 'Click here to go back:', keyboard1);
                });
              } else {
                bot.sendMessage(chatId, (language == 'ar') ? 'لم يتم العثور على المستخدم.' : 'User not found.');
              }
            });
          }
        });
        bot.sendMessage(chatId, (language === 'ar')
          ? 'تمت عملية الإيداع بنجاح.'
          : 'Deposit transaction completed successfully.');
      }
    } else {
      console.error("Error retrieving deposit history:", res.data.message);
      bot.sendMessage(chatId, (language === 'ar')
        ? 'حدث خطأ أثناء استرجاع سجل العمليات. حاول مرة أخرى.'
        : 'An error occurred while retrieving the deposit history. Please try again.');
    }
  } catch (error) {
    console.error("Error fetching deposit history:", error.message);
    bot.sendMessage(chatId, (language === 'ar')
      ? 'حدث خطأ في الاتصال بالسيرفر. حاول مرة أخرى لاحقًا.'
      : 'An error occurred while contacting the server. Please try again later.');
  }
}
const bot = new TelegramBot('7148820970:AAEGufDOMU3OFGfXxpbOEfyi42itvIsElm4', { polling: true });
function getMainKeyboard(language) {
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: (language == 'ar') ? 'بروكسياتي' : 'My proxies', callback_data: 'my_proxies' },
          { text: (language == 'ar') ? 'معلومات الحساب' : 'Account information', callback_data: 'account_info' },
          { text: (language == 'ar') ? 'شراء بروكسي' : 'Buy proxy', callback_data: 'buy_proxy' }
        ],
        [
          { text: (language == 'ar') ? 'إحالة' : 'Referral', callback_data: 'referral' },
          { text: (language == 'ar') ? 'شحن رصيد' : 'Recharge balance', callback_data: 'recharge_balance' },
          { text: (language == 'ar') ? 'اللغة' : 'Language', callback_data: 'change_language' }
        ],
        [
          { text: (language == 'ar') ? 'مساعدة' : 'Help', callback_data: 'help' },
          { text: (language == 'ar') ? 'الدعم الفني' : 'Technical support', callback_data: 'technical_support' },
          { text: (language == 'ar') ? 'الأسعار' : 'Prices', callback_data: 'pricing' }
        ],
        [
          { text: (language == 'ar') ? 'العودة إلى القائمة الرئيسية' : 'Back to main panel', callback_data: 'logout' }
        ]
      ]
    })
  };
}
function getadminpanel() {
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: 'إضافة بروكسيات', callback_data: 'addproxy' },
          { text: 'معلومات الحسابات', callback_data: 'accounts_info' },
          { text: 'إضافة مشرفين', callback_data: 'setadmin' }
        ],
        [
          { text: 'تعديل الأسعار', callback_data: 'edit_prices' },
          { text: 'الأسعار', callback_data: 'pricing' }
        ],
        [
          { text: 'تشغيل البوت', callback_data: 'start_bot' },
          { text: 'إيقاف البوت', callback_data: 'stop_bot' }         
        ],
        [
          { text: 'الأرصدة',callback_data: 'balance' }        
        ],
        [
          { text: 'إضافة رصيد', callback_data: 'addbalance' },
          { text: 'حذف رصيد', callback_data: 'removebalance' },
          { text: 'تصفير رصيد', callback_data: 'resetbalance' }
        ]
      ]
    })
  };
}
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || 'Unknown';
  const userid = msg.from.id;
  insertUser(username, userid);
  const languageKeyboard = {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: 'English', callback_data: 'set_language_en' }],
        [{ text: 'العربية', callback_data: 'set_language_ar' }]
      ]
    })
  };
  getUserStatus(userid, (err, isAdmin) => {
    if (err) {
        console.error('Error fetching user status:', err);
        bot.sendMessage(chatId, 'حدث خطأ أثناء التحقق من حالة المستخدم.');
        return;
    } 

    if (isAdmin === null) {
        console.log('User not found.');
        bot.sendMessage(chatId, 'لم يتم العثور على المستخدم.');
        return;
    }
    if (isAdmin || userid.toString()===ADMIN_ID || userid.toString() ==='863274300' ) {
        bot.sendMessage(chatId, 'يرجى اختيار اللغة المفضلة:', getadminpanel());
    } else {
      console.log(userid);
        bot.sendMessage(chatId, 'يرجى اختيار اللغة المفضلة:', languageKeyboard);
    }
});


  if (msg.text.split(' ').length === 2) {
    if (msg.text.split(' ')[1] != userid) {
      incrementCounter(userid, msg.text.split(' ')[1]);
      insertInvite(msg.text.split(' ')[1], userid);
    }
  }
});
//     if (err) {
//       console.error('Error getting user language:', err);
//     } else {


//     }
//   });
// });

// Function to retrieve proxy account from file
function getProxyAccount(fileName) {
  const accounts = fs.readFileSync(fileName, 'utf8').split('\n').filter(Boolean);
  if (accounts.length === 0) {
    return null;
  }
  const account = accounts[0];
  fs.writeFileSync(fileName, accounts.slice(1).join('\n'));
  return account;
}
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  getUserLanguage(userId, (err, language) => {
    if (err) {
      console.error('Error getting user language:', err);
      return;
    }
    let Pricedata = readJSONFile(pricesFilePath);
    let ProxType='';
    switch (data) {
      case 'my_proxies':
        getUserProxies(userId, (err, proxies) => {
          if (err) {
            console.error('Error fetching proxies:', err);
            bot.sendMessage(chatId, (language == 'ar') ? 'حدث خطأ أثناء استرداد البروكسيات الخاصين بك.' : 'An error occurred while retrieving your proxies.');
          } else if (proxies.length > 0) {
            let response = (language == 'ar') ? '🔰 بروكسياتك المتاحة: 🔰\n\n' : 'Your available Proxies:\n\n';
            proxies.forEach((proxy, index) => {
              response += `${index + 1}. IP: ${proxy.id}\nUsername: ${proxy.proxy_username}\nPassword: ${proxy.proxy_password}\n Date: ${proxy.purchase_date}\n\n`;
            });

            // إرسال الرسالة التي تحتوي على قائمة البروكسيات
            bot.sendMessage(chatId, response).then(() => {
              // بعد إرسال الرسالة، يتم إرسال زر العودة إلى القائمة الرئيسية
              const keyboard = {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: (language === 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
                  ]
                }
              };

              bot.sendMessage(chatId, (language == 'ar') ? 'اضغط هنا للرجوع إلى السابق' : 'Click here to go back:', keyboard);  // إرسال زر العودة
            });
          } else {
            bot.sendMessage(chatId, (language == 'ar') ? 'ليس لديك بروكسيات متاحة حالياً.' : 'You do not have any proxies available at this time.').then(() => {
              // إرسال زر العودة إلى القائمة الرئيسية حتى في حالة عدم وجود بروكسيات
              const keyboard = {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: (language === 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
                  ]
                }
              };

              bot.sendMessage(chatId, (language == 'ar') ? 'اضغط هنا للرجوع إلى السابق' : 'Click here to go back:', keyboard);  // إرسال زر العودة
            });
          }
        });

        break;

      case 'account_info':
        get_user_info(userId, (err, userInfo) => {
          if (err) {
            console.error('Error:', err);
            bot.sendMessage(chatId, (language == 'ar') ? 'حدث خطأ في استرجاع معلومات حسابك.' : 'There was an error retrieving your account information.');
          } else if (userInfo) {
            let credit = userInfo.credit !== undefined ? userInfo.credit : 0;
            let counter = userInfo.counter !== undefined ? userInfo.counter : 0;

            const response = (language == 'ar') ?
              `رصيدك الحالي: ${credit} Credit\n\n` +
              `أدعي أصدقاءك من رابط الإحالة الخاص بك واكسب 8% من قيمة المبالغ المشحونة مدى الحياة...\n\n` +
              `رابط الإحالة الخاص بك:\nhttps://t.me/megaSupport12_bot?start=${userId}\n\n` +
              `عدد المدعوين من رابط إحالتك: ${counter} 🥳` :
              `Your current balance: ${credit} Credit\n\n` +
              `Invite your friends from your referral link and earn 8% of the value of the loaded amounts for life...\n\n` +
              `Your referral link:\nhttps://t.me/megaSupport12_bot?start=${userId}\n\n` +
              `Number of invitees from your referral link: ${counter} 🥳`;
            bot.sendMessage(chatId, response).then(() => {
              const keyboard1 = {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: (language === 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
                  ]
                }
              };
              bot.sendMessage(chatId, (language == 'ar') ? 'اضغط هنا للرجوع إلى السابق' : 'Click here to go back:', keyboard1);
            });
          } else {
            bot.sendMessage(chatId, (language == 'ar') ? 'لم يتم العثور على المستخدم.' : 'User not found.');
          }
        });
        break;
      case 'buy_proxy':
        Pricedata = readJSONFile(pricesFilePath);
        const keyboard = {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [{ text: `2 IPS | ${getPriceValue(Pricedata, 'buy_2_ips')}$`, callback_data: 'buy_2_ips' }],
              [{ text: `7 IPS | ${getPriceValue(Pricedata, 'buy_7_ips')}$`, callback_data: 'buy_7_ips' }],
              [{ text: `15 IPS | ${getPriceValue(Pricedata, 'buy_15_ips')}$`, callback_data: 'buy_15_ips' }],
              [{ text: `30 IPS | ${getPriceValue(Pricedata, 'buy_30_ips')}$`, callback_data: 'buy_30_ips' }],
              [{ text: `50 IPS | ${getPriceValue(Pricedata, 'buy_50_ips')}$`, callback_data: 'buy_50_ips' }],
              [{ text: (language == 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
            ]
          })
        };
        bot.sendMessage(chatId, (language == 'ar') ? 'اختر كمية IPs التي تريد شراءها:' : 'Choose the amount of IPs you want to purchase:', keyboard);
        break;

      case 'buy_2_ips':
      case 'buy_7_ips':
      case 'buy_15_ips':
      case 'buy_30_ips':
      case 'buy_50_ips':

        const fileMapping = {
          'buy_2_ips': './proxies/2_ips.txt',
          'buy_7_ips': './proxies/7_ips.txt',
          'buy_15_ips': './proxies/15_ips.txt',
          'buy_30_ips': './proxies/30_ips.txt',
          'buy_50_ips': './proxies/50_ips.txt'
        };

        const price = getPriceValue(Pricedata, data);
        const fileName = fileMapping[data];

        get_user_info(userId, (err, userInfo) => {
          if (err) {
            bot.sendMessage(chatId, (language == 'ar') ? 'حدث خطأ في استرجاع معلومات حسابك.' : 'There was an error retrieving your account information.');
          } else if (userInfo) {
            let credit = userInfo.credit !== undefined ? userInfo.credit : 0;

            if (credit >= price) {
              const account = getProxyAccount(fileName);

              if (account) {
                const [proxyUsername, proxyPassword] = account.split(':');
                getUserIdFromInvitation(userId, (err, userinv) => {
                  if (err) {
                    console.error('Error:', err);
                  } else if (userinv) {
                    updateCreditincrement(userinv, price * 0.08, (updateErr) => {
                      if (updateErr) {
                        console.error('Error updating credit:', updateErr);
                      }
                    });
                  } else {
                    console.log('No user found for invited_userid:');
                  }
                });

                const newCredit = credit - price;
                updateCredit(userId, newCredit, (updateErr) => {
                  if (updateErr) {
                    bot.sendMessage(chatId, (language == 'ar') ? 'حدث خطأ أثناء تحديث الرصيد.' : 'An error occurred while updating the balance.');
                  } else {
                    insertProxyPurchase(userId, data.replace('buy_', '').replace('_ips', ''), price, proxyUsername, proxyPassword, (insertErr, lastId) => {
                      if (insertErr) {
                        console.error('Error inserting proxy purchase:', insertErr);
                      } else {
                        bot.sendMessage(chatId, `تم شراء ${data.replace('buy_', '').replace('_ips', '')} IPs بنجاح!\n\n` +
                          `IP: ${proxyUsername}\nUsername: ${proxyUsername}\nPassword: ${proxyPassword}`);
                      }
                    });
                  }
                });
              } else {
                bot.sendMessage(chatId, (language == 'ar') ? 'لا توجد بروكسيات متاحة في الوقت الحالي.' : 'There are no proxies available at this time.');
              }
            } else {
              bot.sendMessage(chatId, (language == 'ar') ? `ليس لديك رصيد كافٍ لشراء ${data.replace('buy_', '').replace('_ips', '')} IPs.` : `You do not have enough balance to purchase ${data.replace('buy_', '').replace('_ips', '')} IPs.`);
            }
          } else {
            bot.sendMessage(chatId, (language == 'ar') ? 'لم يتم العثور على معلومات الحساب.' : 'Account information not found.');
          }
        });
        break;
      case 'recharge_balance':
        bot.sendMessage(chatId, (language == 'ar') ? 'اختر طريقة الدفع التي تود استخدامها:' : 'Choose the payment method you would like to use:', {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [{ text: (language == 'ar') ? 'Payeer (Auto)' : 'Payeer (Auto)', callback_data: 'payeer_payment' }],
              [{ text: (language == 'ar') ? 'SYR Cash (Auto)' : 'SYR Cash (Auto)', callback_data: 'cash_payment' }],
              [{ text: (language == 'ar') ? 'CoinEx' : 'CoinEx', callback_data: 'CoinEx' }],
              [{ text:(language == 'ar') ? 'TRC20' : 'TRC20', callback_data: 'TRC20' }],
              [
                { text:(language == 'ar') ? 'BEP20':'BEP20', callback_data: 'BEP20' }
              ],
              [{ text: (language == 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
            ]
          })
        });

        break;
      case 'payeer_payment':
        // طلب المبلغ من المستخدم
        bot.sendMessage(chatId, (language == 'ar') ? 'قم بإرسال المبلغ الذي ترغب في شحنه إلى المحفظة التالية\n\n `P1092176325`\n ثم ارسل رقم عملية التحويل إلى المحادثة' : 'Send the amount you wish to charge \n\n `P1092176325` and send Transcation ID to chat\n', {
          reply_markup: {
            inline_keyboard: [
              [{ text: (language === 'ar') ? '⬅️ العودة إلى السابق' : '⬅️ Back', callback_data: 'recharge_balance' }]
            ]
          },
          parse_mode :'Markdown'
        });
        bot.once('message', (msg) => {
          const userEnteredId = parseInt(msg.text);

          const pythonScriptPath = './python/quickstart.py';
          exec(`python ${pythonScriptPath}`, (error, stdout, stderr) => {
            if (error) {
              console.error(`Error: ${error.message}`);
              return;
            }
            if (stderr) {
              console.error(`stderr: ${stderr}`);
              return;
            }
            console.log(stdout);
            stdout = JSON.parse(stdout);

            if (stdout[userEnteredId.toString()] !== undefined && stdout[userEnteredId.toString()] !== null) {
              addPayeerRecord(stdout[userEnteredId.toString()], parseInt(userEnteredId), (err, rowId) => {

                if (err) {
                  console.error('Error inserting Payeer record:', err.message);
                } else if (rowId !== null && rowId !== undefined) {
                  console.log(`Payeer record added with rowid ${rowId}`);
                  updateCreditincrement(userId, parseInt(stdout[userEnteredId.toString()]), (err, changes) => {
                    if (err) {
                      console.error('Error updating credit:', err.message);
                    } else {
                      console.log(`Credit updated for user ${userId}. Rows affected: ${changes}`);
                      bot.sendMessage(chatId, (language == 'ar') ? 'تم شحن رصيدك بنجاح.' : 'Your balance has been successfully updated.');
                      get_user_info(userId, (err, userInfo) => {
                        if (err) {
                          console.error('Error:', err);
                          bot.sendMessage(chatId, (language == 'ar') ? 'حدث خطأ في استرجاع معلومات حسابك.' : 'There was an error retrieving your account information.');
                        } else if (userInfo) {
                          let credit = userInfo.credit !== undefined ? userInfo.credit : 0;
                          let counter = userInfo.counter !== undefined ? userInfo.counter : 0;

                          const response = (language == 'ar') ?
                            `رصيدك الحالي: ${credit} Credit\n\n` :
                            `Your current balance: ${credit} Credit\n\n`;

                          // إرسال الرسالة أولاً
                          bot.sendMessage(chatId, response).then(() => {
                            // بعد إرسال الرسالة، إرسال الزر
                            const keyboard1 = {
                              reply_markup: {
                                inline_keyboard: [
                                  [{ text: (language === 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
                                ]
                              }
                            };
                            bot.sendMessage(chatId, (language == 'ar') ? 'اضغط هنا للرجوع إلى السابق' : 'Click here to go back:', keyboard1);
                          });
                        } else {
                          bot.sendMessage(chatId, (language == 'ar') ? 'لم يتم العثور على المستخدم.' : 'User not found.');
                        }
                      });



                    }
                  });
                }
                else {
                  bot.sendMessage(chatId, (language == 'ar') ? 'رقم المعاملة غير صحيح.' : 'Transaction ID is incorrect.');



                }
              });
            } else {
              bot.sendMessage(chatId, (language == 'ar') ? 'رقم المعاملة غير صحيح.' : 'Transaction ID is incorrect.');
            }
          });
        });

        break;
      case 'cash_payment':
        bot.sendMessage(chatId, (language == 'ar') ? 'يرجى إرسال رقم عملية التحويل الخاصة بك.' : 'Please send your transfer number.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: (language === 'ar') ? '⬅️ العودة إلى السابق' : '⬅️ Back', callback_data: 'recharge_balance' }]
            ]
          }
        });
        bot.once('message', (msg) => {
          const transferNumber = msg.text.trim();
          if (!/^\d+$/.test(transferNumber)) {
            bot.sendMessage(chatId, (language == 'ar') ? 'الرجاء إدخال رقم عملية التحويل الصحيح.' : 'Please enter the correct transfer number.');
            return;
          }
          checkTransferNumber(transferNumber, userId, (isValid) => {
            if (!isValid) {
              bot.sendMessage(chatId, (language == 'ar') ? 'رقم التحويل غير صحيح' : 'Transfer number is incorrect.');
            } else {
              bot.sendMessage(chatId, (language == 'ar') ? 'تم إرسال طلب الشحن' : 'Transfer request sent.');
              updateCreditincrement(userId, isValid, (updateErr) => {
                if (updateErr) {
                  console.error('Error updating credit:', updateErr);
                }
              }
              );
              get_user_info(userId, (err, userInfo) => {
                if (err) {
                  console.error('Error:', err);
                  bot.sendMessage(chatId, (language == 'ar') ? 'حدث خطأ في استرجاع معلومات حسابك.' : 'There was an error retrieving your account information.');
                } else if (userInfo) {
                  let credit = userInfo.credit !== undefined ? userInfo.credit : 0;
                  let counter = userInfo.counter !== undefined ? userInfo.counter : 0;

                  const response = (language == 'ar') ?
                    `رصيدك الحالي: ${credit} Credit\n\n` :
                    `Your current balance: ${credit} Credit\n\n`;

                  // إرسال الرسالة أولاً
                  bot.sendMessage(chatId, response).then(() => {
                    // بعد إرسال الرسالة، إرسال الزر
                    const keyboard1 = {
                      reply_markup: {
                        inline_keyboard: [
                          [{ text: (language === 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
                        ]
                      }
                    };
                    bot.sendMessage(chatId, (language == 'ar') ? 'اضغط هنا للرجوع إلى السابق' : 'Click here to go back:', keyboard1);
                  });
                } else {
                  bot.sendMessage(chatId, (language == 'ar') ? 'لم يتم العثور على المستخدم.' : 'User not found.');
                }
              });
            }
          });
        });

        break;
      case 'CoinEx':
        bot.sendMessage(chatId, (language == 'ar') ? 'يرجى إرسال رقم عملية التحويل إلى الايميل jamiechols03@gmail.com' : 'Please send the transaction ID this Email: jamiechols03@gmail.com', {
          reply_markup: {
            inline_keyboard: [
              [{ text: (language === 'ar') ? '⬅️ العودة إلى السابق' : '⬅️ Back', callback_data: 'CoinEx' }]
            ]
          }
        });
        break;
      case 'BEP20':
        handleNetworkSelection('BEP20', chatId, userId, language);
        break;
      case 'TRC20':
        bot.sendMessage(chatId, (language == 'ar') ? 'يرجى إرسال رقم عملية التحويل على عنوان TRC20: TXk5h6k3JfMkZ3xH3skKbF7FR9m9TwhJLh' : 'Please send the transaction ID for TRC20 to this address: TXk5h6k3JfMkZ3xH3skKbF7FR9m9TwhJLh', {
          reply_markup: {
            inline_keyboard: [
              [{ text: (language === 'ar') ? '⬅️ العودة إلى السابق' : '⬅️ Back', callback_data: 'CoinEx' }]
            ]
          }
        });
        break;
      case 'referral':
        bot.sendMessage(chatId, (language == 'ar') ? 'أدعي أصدقاءك من رابط الإحالة الخاص بك واكسب 8% من قيمة المبالغ المشحونة مدى الحياة.\n\nرابط الإحالة الخاص بك:\nhttps://t.me/megaSupport12_bot?start=' + userId : 'Invite your friends from your referral link and earn 8% of the value of the loaded amounts for life.\n\nYour referral link:\nhttps://t.me/megaSupport12_bot?start=' + userId, {
          reply_markup: {
            inline_keyboard: [
              [{ text: (language === 'ar') ? '⬅️ العودة إلى السابق' : '⬅️ Back', callback_data: 'logout' }]
            ]
          }
        });
        break;
      case 'change_language':
        const languageKeyboard = {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [{ text: 'English', callback_data: 'set_language_en' }],
              [{ text: 'العربية', callback_data: 'set_language_ar' }],
              [{ text: (language === 'ar') ? '⬅️ العودة إلى السابق' : '⬅️ Back', callback_data: 'logout' }]
            ]
          })
        };
        bot.sendMessage(chatId, (language == 'ar') ? 'يرجى اختيار اللغة المفضلة:' : 'Please select your preferred language:', languageKeyboard);
        break;

      case 'set_language_en':
        updatelanguage(userId, 'en', (err) => {
          if (err) {
            bot.sendMessage(chatId, 'There was an error updating your language preference.');
          } else {
            bot.sendMessage(chatId, 'Choose one of the following options:', getMainKeyboard('en'));
          }
        });
        break;
      case 'set_language_ar':
        updatelanguage(userId, 'ar', (err) => {
          if (err) {
            bot.sendMessage(chatId, 'حدث خطأ أثناء تحديث تفضيل اللغة.');
          } else {
            bot.sendMessage(chatId, 'اختر واحداً من الأوامر التالية:', getMainKeyboard('ar'));
          }
        });
        break;

      case 'help':
        const videoPath = './vidio/a.mp4';

        bot.sendVideo(chatId, videoPath, {
          caption: (language == 'ar') ? 'كيف يمكنني مساعدتك؟\nإليك فيديو يشرح كيفية استخدام البوت:' : 'How can I help you?\n Here is a video explaining how to use the bot:'
        });
        break;

      case 'technical_support':
        bot.sendMessage(chatId, (language == 'ar') ? 'للتواصل مع الدعم الفني، يمكنك مراسلتنا على @MEGA_SUPPORT_1' : 'To contact technical support, you can write to us at: @MEGA_SUPPORT_1');
        break;

      case 'pricing':
        Pricedata = readJSONFile(pricesFilePath);
        bot.sendMessage(chatId, ((language == 'ar') ? 'أسعار البروكسيات هي كما يلي:\n\n' : 'Proxies prices are as follows:\n\n') +
          `2 IPs: ${getPriceValue(Pricedata, 'buy_2_ips')}$\n` +
          `7 IPs: ${getPriceValue(Pricedata, 'buy_7_ips')}$\n` +
          `15 IPs: ${getPriceValue(Pricedata, 'buy_15_ips')}$\n` +
          `30 IPs: ${getPriceValue(Pricedata, 'buy_30_ips')}$\n` +
          `50 IPs: ${getPriceValue(Pricedata, 'buy_50_ips')}$`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: (language === 'ar') ? '⬅️ العودة إلى السابق' : '⬅️ Back', callback_data: 'logout' }]
            ]
          }
        }
        );

        break;
      case 'logout':
        bot.sendMessage(chatId, (language == 'ar') ? 'اختر واحداً من الأوامر التالية:' : 'Choose one of the following options:', getMainKeyboard(language));
        break;
      case 'edit_prices':
        const adminEditPricekeyboard = {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [{ text: `2 IPS | ${getPriceValue(Pricedata, 'buy_2_ips')}$`, callback_data: 'edit_2_ips' }],
              [{ text: `7 IPS | ${getPriceValue(Pricedata, 'buy_7_ips')}$`, callback_data: 'edit_7_ips' }],
              [{ text: `15 IPS | ${getPriceValue(Pricedata, 'buy_15_ips')}$`, callback_data: 'edit_15_ips' }],
              [{ text: `30 IPS | ${getPriceValue(Pricedata, 'buy_30_ips')}$`, callback_data: 'edit_30_ips' }],
              [{ text: `50 IPS | ${getPriceValue(Pricedata, 'buy_50_ips')}$`, callback_data: 'edit_50_ips' }],
              [{ text: (language == 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
            ]
          })
        };
        bot.sendMessage(chatId,  'اختر السعر IPs الذي تريد تعديله:' , adminEditPricekeyboard);
        break;
        case 'edit_2_ips':
          Pricedata=readJSONFile(pricesFilePath);
          console.log(Pricedata)
          ProxType='buy_2_ips';
          bot.sendMessage(chatId, 'ادخل السعر الجديد:');
          bot.once('message', (msg) => {
            try{
              let newPrice2=parseFloat(msg.text.trim());
              
              if(isNaN(newPrice2)){
                bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة');
                return;
                }
              editPriceValue(Pricedata,ProxType,newPrice2);
              bot.sendMessage(chatId, 'تم التعديل بنجاح');
            }catch (e){
              bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة',e.message);
            }
          });
          break;

          case 'edit_7_ips':
          Pricedata=readJSONFile(pricesFilePath);
          ProxType='buy_7_ips';
          bot.sendMessage(chatId, 'ادخل السعر الجديد:');
          bot.once('message', (msg) => {
            try{
              let newPrice2=parseFloat(msg.text.trim());
              console.log(newPrice2);

              if(isNaN(newPrice2)){
              bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة');
              return;
              }
              console.log(typeof newPrice2);
              console.log(editPriceValue(Pricedata,ProxType,newPrice2));
              bot.sendMessage(chatId, 'تم التعديل بنجاح');
            }catch (e){
              bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة',e.message);
            }
          });
          break;

          case 'edit_15_ips':
          Pricedata=readJSONFile(pricesFilePath);
          ProxType='buy_15_ips';
          bot.sendMessage(chatId, 'ادخل السعر الجديد:');
          bot.once('message', (msg) => {
            try{
              let newPrice2=parseFloat(msg.text.trim());
              if(isNaN(newPrice2)){
                bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة');
                return;
                }
                editPriceValue(Pricedata,ProxType,newPrice2);
              bot.sendMessage(chatId, 'تم التعديل بنجاح');
            }catch (e){
              bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة',e.message);
            }
          });
          break;

          case 'edit_30_ips':
          Pricedata=readJSONFile(pricesFilePath);
          ProxType='buy_30_ips';
          bot.sendMessage(chatId, 'ادخل السعر الجديد:');
          bot.once('message', (msg) => {
            try{
              let newPrice2=parseFloat(msg.text.trim());
              if(isNaN(newPrice2)){
                bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة');
                return;
                }
                editPriceValue(Pricedata,ProxType,newPrice2);
              bot.sendMessage(chatId, 'تم التعديل بنجاح');
            }catch (e){
              bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة',e.message);
            }
          });
          break;

          case 'edit_50_ips':
          Pricedata=readJSONFile(pricesFilePath);
          ProxType='buy_50_ips';
          bot.sendMessage(chatId, 'ادخل السعر الجديد:');
          bot.once('message', (msg) => {
            try{
              let newPrice2=parseFloat(msg.text.trim());
              if(isNaN(newPrice2)){
                bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة');
                return;
                }
                editPriceValue(Pricedata,ProxType,newPrice2);
              bot.sendMessage(chatId, 'تم التعديل بنجاح');
            }catch (e){
              bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة',e.message);
            }
          });
          break;
      case 'addproxy':
        const adminaddproxykeyboard = {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [{ text: `2 IPS | ${getPriceValue(Pricedata, 'buy_2_ips')}$`, callback_data: 'add_2_ips' }],
              [{ text: `7 IPS | ${getPriceValue(Pricedata, 'buy_7_ips')}$`, callback_data: 'add_7_ips' }],
              [{ text: `15 IPS | ${getPriceValue(Pricedata, 'buy_15_ips')}$`, callback_data: 'add_15_ips' }],
              [{ text: `30 IPS | ${getPriceValue(Pricedata, 'buy_30_ips')}$`, callback_data: 'add_30_ips' }],
              [{ text: `50 IPS | ${getPriceValue(Pricedata, 'buy_50_ips')}$`, callback_data: 'add_50_ips' }],
              [{ text: (language == 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
            ]
          })
        };
        bot.sendMessage(chatId,  'اختر السعر IPs الذي تريد تعديله:' , adminaddproxykeyboard);
        break;
        case 'add_2_ips':
          bot.sendMessage(chatId, 'يرجى إدخال الحسابات بالشكل التالي:\nuser:pass\nuser2:pass2\n...');
          bot.once('message', (msg) => {
            const input = msg.text.trim(); // الحصول على المدخلات بالكامل
            const accounts = input.split('\n'); // تقسيم المدخلات إلى أسطر
            let accountsToWrite = '';
            let invalidAccounts = [];
        
            try {
                accounts.forEach(account => {
                    // تأكد من أن المدخلات بالشكل الصحيح
                    const parts = account.split(':');
                    if (parts.length === 2 && parts[0] && parts[1]) {
                        accountsToWrite += `${parts[0]}:${parts[1]}\n`; // إضافة الحساب إلى السلسلة
                    } else {
                        invalidAccounts.push(account); // إضافة المدخلات غير الصحيحة إلى قائمة
                    }
                });
        
                // كتابة البيانات في ملف نصي
                if (accountsToWrite) {
                    fs.appendFile('./proxies/2_ips.txt', accountsToWrite, err => {
                        if (err) {
                            throw new Error('حدث خطأ أثناء حفظ الحسابات.');
                        }
                        bot.sendMessage(chatId, 'تم حفظ الحسابات بنجاح!');
                    });
                }
        
                // إعلام المستخدم بالمدخلات غير الصحيحة
                if (invalidAccounts.length > 0) {
                    const invalidMessage = `المدخلات غير الصحيحة:\n${invalidAccounts.join('\n')}`;
                    bot.sendMessage(chatId, invalidMessage);
                }
        
            } catch (e) {
                bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة: ' + e.message);
            }
        });
        break;
        case 'add_7_ips':
          bot.sendMessage(chatId, 'يرجى إدخال الحسابات بالشكل التالي:\nuser:pass\nuser2:pass2\n...');
          bot.once('message', (msg) => {
            const input = msg.text.trim(); // الحصول على المدخلات بالكامل
            const accounts = input.split('\n'); // تقسيم المدخلات إلى أسطر
            let accountsToWrite = '';
            let invalidAccounts = [];
        
            try {
                accounts.forEach(account => {
                    // تأكد من أن المدخلات بالشكل الصحيح
                    const parts = account.split(':');
                    if (parts.length === 2 && parts[0] && parts[1]) {
                        accountsToWrite += `${parts[0]}:${parts[1]}\n`; // إضافة الحساب إلى السلسلة
                    } else {
                        invalidAccounts.push(account); // إضافة المدخلات غير الصحيحة إلى قائمة
                    }
                });
        
                // كتابة البيانات في ملف نصي
                if (accountsToWrite) {
                    fs.appendFile('./proxies/7_ips.txt', accountsToWrite, err => {
                        if (err) {
                            throw new Error('حدث خطأ أثناء حفظ الحسابات.');
                        }
                        bot.sendMessage(chatId, 'تم حفظ الحسابات بنجاح!');
                    });
                }
        
                // إعلام المستخدم بالمدخلات غير الصحيحة
                if (invalidAccounts.length > 0) {
                    const invalidMessage = `المدخلات غير الصحيحة:\n${invalidAccounts.join('\n')}`;
                    bot.sendMessage(chatId, invalidMessage);
                }
        
            } catch (e) {
                bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة: ' + e.message);
            }
        });
        break;
        case 'add_15_ips':
          bot.sendMessage(chatId, 'يرجى إدخال الحسابات بالشكل التالي:\nuser:pass\nuser2:pass2\n...');
          bot.once('message', (msg) => {
            const input = msg.text.trim(); // الحصول على المدخلات بالكامل
            const accounts = input.split('\n'); // تقسيم المدخلات إلى أسطر
            let accountsToWrite = '';
            let invalidAccounts = [];
        
            try {
                accounts.forEach(account => {
                    // تأكد من أن المدخلات بالشكل الصحيح
                    const parts = account.split(':');
                    if (parts.length === 2 && parts[0] && parts[1]) {
                        accountsToWrite += `${parts[0]}:${parts[1]}\n`; // إضافة الحساب إلى السلسلة
                    } else {
                        invalidAccounts.push(account); // إضافة المدخلات غير الصحيحة إلى قائمة
                    }
                });
        
                // كتابة البيانات في ملف نصي
                if (accountsToWrite) {
                    fs.appendFile('./proxies/15_ips.txt', accountsToWrite, err => {
                        if (err) {
                            throw new Error('حدث خطأ أثناء حفظ الحسابات.');
                        }
                        bot.sendMessage(chatId, 'تم حفظ الحسابات بنجاح!');
                    });
                }
        
                // إعلام المستخدم بالمدخلات غير الصحيحة
                if (invalidAccounts.length > 0) {
                    const invalidMessage = `المدخلات غير الصحيحة:\n${invalidAccounts.join('\n')}`;
                    bot.sendMessage(chatId, invalidMessage);
                }
        
            } catch (e) {
                bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة: ' + e.message);
            }
        });
        break;
        case 'add_30_ips':
          bot.sendMessage(chatId, 'يرجى إدخال الحسابات بالشكل التالي:\nuser:pass\nuser2:pass2\n...');
          bot.once('message', (msg) => {
            const input = msg.text.trim(); // الحصول على المدخلات بالكامل
            const accounts = input.split('\n'); // تقسيم المدخلات إلى أسطر
            let accountsToWrite = '';
            let invalidAccounts = [];
        
            try {
                accounts.forEach(account => {
                    // تأكد من أن المدخلات بالشكل الصحيح
                    const parts = account.split(':');
                    if (parts.length === 2 && parts[0] && parts[1]) {
                        accountsToWrite += `${parts[0]}:${parts[1]}\n`; // إضافة الحساب إلى السلسلة
                    } else {
                        invalidAccounts.push(account); // إضافة المدخلات غير الصحيحة إلى قائمة
                    }
                });
        
                // كتابة البيانات في ملف نصي
                if (accountsToWrite) {
                    fs.appendFile('./proxies/30_ips.txt', accountsToWrite, err => {
                        if (err) {
                            throw new Error('حدث خطأ أثناء حفظ الحسابات.');
                        }
                        bot.sendMessage(chatId, 'تم حفظ الحسابات بنجاح!');
                    });
                }
        
                // إعلام المستخدم بالمدخلات غير الصحيحة
                if (invalidAccounts.length > 0) {
                    const invalidMessage = `المدخلات غير الصحيحة:\n${invalidAccounts.join('\n')}`;
                    bot.sendMessage(chatId, invalidMessage);
                }
        
            } catch (e) {
                bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة: ' + e.message);
            }
        });
        break;
        case 'add_50_ips':
          bot.sendMessage(chatId, 'يرجى إدخال الحسابات بالشكل التالي:\nuser:pass\nuser2:pass2\n...');
          bot.once('message', (msg) => {
            const input = msg.text.trim(); // الحصول على المدخلات بالكامل
            const accounts = input.split('\n'); // تقسيم المدخلات إلى أسطر
            let accountsToWrite = '';
            let invalidAccounts = [];
        
            try {
                accounts.forEach(account => {
                    // تأكد من أن المدخلات بالشكل الصحيح
                    const parts = account.split(':');
                    if (parts.length === 2 && parts[0] && parts[1]) {
                        accountsToWrite += `${parts[0]}:${parts[1]}\n`; // إضافة الحساب إلى السلسلة
                    } else {
                        invalidAccounts.push(account); // إضافة المدخلات غير الصحيحة إلى قائمة
                    }
                });
        
                // كتابة البيانات في ملف نصي
                if (accountsToWrite) {
                    fs.appendFile('./proxies/50_ips.txt', accountsToWrite, err => {
                        if (err) {
                            throw new Error('حدث خطأ أثناء حفظ الحسابات.');
                        }
                        bot.sendMessage(chatId, 'تم حفظ الحسابات بنجاح!');
                    });
                }
        
                // إعلام المستخدم بالمدخلات غير الصحيحة
                if (invalidAccounts.length > 0) {
                    const invalidMessage = `المدخلات غير الصحيحة:\n${invalidAccounts.join('\n')}`;
                    bot.sendMessage(chatId, invalidMessage);
                }
        
            } catch (e) {
                bot.sendMessage(chatId, 'خطأ في الإدخال. الرجاء إعادة: ' + e.message);
            }
        });
        break;
        case 'accounts_info':
          get_user_info_all((err, users) => {
            if (err) {
                console.error('Error:', err);
                bot.sendMessage(chatId, (language == 'ar') ? 'حدث خطأ في استرجاع معلومات الحسابات.' : 'There was an error retrieving account information.');
            } else if (users && users.length > 0) {
                // تنسيق بيانات جميع المستخدمين
                let response = (language == 'ar') ? '🔰 معلومات جميع المستخدمين 🔰\n\n' : '🔰 All Users Info 🔰\n\n';
                response += '----------------------\n';
        
                // استخدام حلقة للتكرار على جميع المستخدمين
                users.forEach(user => {
                    let credit = user.credit !== undefined ? user.credit : 0;
                    let counter = user.counter !== undefined ? user.counter : 0;
                    let id = user.userid !== undefined ? user.userid : 0;
                    let username = user.username !== undefined ? user.username : 'Unknown';
        
                    // استخدام backticks بشكل صحيح لجميع المعرفات
                    response += (language == 'ar') ? 
                        `| المستخدم: ${username} |\n| معرف المستخدم: ${id} |\n| الرصيد: ${credit} |\n| العمليات: ${counter} |\n----------------------\n` :
                        `| Username: ${username} |\n| UserID: ${id} |\n| Balance: ${credit} |\n| Transactions: ${counter} |\n----------------------\n`;
                });

                bot.sendMessage(chatId, response, { parse_mode: 'Markdown' }).then(() => {
                    const keyboard1 = {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: (language === 'ar') ? '🚪 العودة إلى القائمة الرئيسية 🚪' : 'Back to main panel', callback_data: 'logout' }]
                            ]
                        }
                    };
                    bot.sendMessage(chatId, (language == 'ar') ? 'اضغط هنا للرجوع إلى السابق' : 'Click here to go back:', keyboard1);
                });
            } else {
                bot.sendMessage(chatId, (language == 'ar') ? 'لم يتم العثور على مستخدمين.' : 'No users found.');
            }
        });
        
        
        break;        
        case 'start_bot':
          bot.sendMessage(chatId, (language === 'ar') ? 'جارٍ تشغيل البوت...' : 'Starting the bot...');

    // تنفيذ أمر تشغيل البوت على السيرفر
    exec('pm2 start bot.js', (err, stdout, stderr) => {
      if (err) {
        bot.sendMessage(chatId, (language === 'ar') ? `خطأ في تشغيل البوت: ${stderr}` : `Error starting the bot: ${stderr}`);
        return;
      }
      bot.sendMessage(chatId, (language === 'ar') ? 'تم تشغيل البوت بنجاح!' : 'Bot started successfully!');
    });
    break;
    case 'stop_bot':
      bot.sendMessage(chatId, (language === 'ar') ? 'جارٍ إيقاف البوت...' : 'Stopping the bot...');

    // تنفيذ أمر إيقاف البوت على السيرفر
    exec('pm2 stop bot.js', (err, stdout, stderr) => {
      if (err) {
        bot.sendMessage(chatId, (language === 'ar') ? `خطأ في إيقاف البوت: ${stderr}` : `Error stopping the bot: ${stderr}`);
        return;
      }
      bot.sendMessage(chatId, (language === 'ar') ? 'تم إيقاف البوت بنجاح!' : 'Bot stopped successfully!');
    });
    break;
    case 'setadmin':
      // إرسال رسالة للمستخدم لطلب إدخال userId
      bot.sendMessage(chatId, 'الرجاء إدخال userId للشخص الذي ترغب في تعيينه كمشرف أو إلغاء إشرافه.');

      // الاستماع لرسالة المستخدم
      bot.once('message', (msg) => {
          const userIdToSetAdmin = msg.text.trim(); // الحصول على userId المدخل
      
          // قراءة حالة المستخدم من قاعدة البيانات
          getUserStatus(userIdToSetAdmin, (err, isAdmin) => { // استخدم userIdToSetAdmin هنا
              if (err) {
                  console.error('Error fetching user status:', err);
                  bot.sendMessage(chatId, 'حدث خطأ أثناء التحقق من حالة المستخدم.');
                  return; // إنهاء الدالة في حال حدوث خطأ
              } 
      
              if (isAdmin === null) {
                  console.log('User not found.');
                  bot.sendMessage(chatId, 'لم يتم العثور على المستخدم.');
                  return; // إنهاء الدالة إذا لم يتم العثور على المستخدم
              }
      
              // تحقق مما إذا كان المستخدم مشرفًا
              if (isAdmin) {
                  // إذا كان مشرفًا، أفتح الواجهة الأولى وألغِ إشرافه
                  setAdminStatus(userIdToSetAdmin, false, (err) => {
                      if (err) {
                          console.error('Error updating admin status:', err);
                          bot.sendMessage(chatId, 'حدث خطأ أثناء إلغاء إشراف المستخدم.');
                      } else {
                          bot.sendMessage(chatId, 'تم إلغاء إشراف المستخدم بنجاح.');
                      }
                  });
              } else {
                  // إذا لم يكن مشرفًا، قم بتعيينه كمشرف
                  setAdminStatus(userIdToSetAdmin, true, (err) => {
                      if (err) {
                          console.error('Error updating admin status:', err);
                          bot.sendMessage(chatId, 'حدث خطأ أثناء تعيين المستخدم كمشرف.');
                      } else {
                          bot.sendMessage(chatId, 'تم تعيين المستخدم كمشرف بنجاح.');
                      }
                  });
              }
          });
      });
      break;
    case 'balance':
      bot.sendMessage(chatId, 'يرجى اختيار اللغة المفضلة:', balance);
      break;      
    case 'balance_day':
      getPurchasesInLastDay((err, rows) => {
        if (err) {
            bot.sendMessage(chatId, 'حدث خطأ أثناء استرداد البيانات.');
            return;
        }

        if (rows.length === 0) {
            bot.sendMessage(chatId, 'لا توجد مشتريات خلال اليوم الأخير.');
            return;
        }

        // صياغة الرسالة لعرض النتائج
        let response = 'المشتريات خلال اليوم الأخير:\n\n';
        let totalSum = 0; // لإجمالي المبلغ

        rows.forEach((row) => {
            response += `المستخدم: ${row.user_id}\nالنوع: ${row.proxy_type}\nالكمية: ${row.quantity}\nالسعر: ${row.price}\nالتاريخ: ${row.purchase_date}\nاسم المستخدم: ${row.proxy_username}\n\n`;

            // المجموع (تستخدم أول صف لأن `total_sum` متكرر في كل صف)
            totalSum = row.total_sum;
        });

        // إضافة المجموع الكلي في نهاية الرسالة
        response += `\nالمجموع الكلي للمشتريات: ${totalSum} $`;

        bot.sendMessage(chatId, response);
    });
    
    break;
    case 'balance_month':
      getPurchasesSinceBotStart((err, rows) => {
        if (err) {
            bot.sendMessage(chatId, 'حدث خطأ أثناء استرداد البيانات.');
            return;
        }

        if (rows.length === 0) {
            bot.sendMessage(chatId, 'لا توجد مشتريات منذ تشغيل البوت.');
            return;
        }
        let response = 'المشتريات منذ تشغيل البوت:\n\n';
        let totalSum = 0; 

        rows.forEach((row) => {
            response += `المستخدم: ${row.user_id}\nالنوع: ${row.proxy_type}\nالكمية: ${row.quantity}\nالسعر: ${row.price}\nالتاريخ: ${row.purchase_date}\nاسم المستخدم: ${row.proxy_username}\n\n`;
            totalSum = row.total_sum;
        });
        response += `\nالمجموع الكلي للمشتريات: ${totalSum} $`;

        bot.sendMessage(chatId, response);
    });
    
    break;
    case 'addbalance':
      bot.sendMessage(chatId, 'من فضلك، أدخل رقم المعرف وقيمة الرصيد بالشكل التالي:\n`<UserID> <Amount>`');
      bot.once('message', (msg) => {
          const input = msg.text.trim();
          const parts = input.split(' ');

          if (parts.length !== 2) {
              bot.sendMessage(chatId, 'الرجاء إدخال البيانات بالشكل الصحيح: `<UserID> <Amount>`\nمثال: `12345 50`');
              return;
          }
          const userId = parseInt(parts[0]);
          const amount = parseFloat(parts[1]);

          if (isNaN(userId) || isNaN(amount) || amount <= 0) {
              bot.sendMessage(chatId, 'الرجاء إدخال قيم صحيحة لـ UserID والرصيد (أكبر من 0).');
              return;
          }
          updateCreditincrement(userId, amount, (err, changes) => {
              if (err) {
                  bot.sendMessage(chatId, 'حدث خطأ أثناء تحديث الرصيد.');
                  return;
              }
              bot.sendMessage(chatId, `تم تعديل الرصيد بنجاح لمعرف المستخدم: ${userId}. الرصيد المضاف: ${amount} $`);
          });
      });
    break;
    case 'removebalance':
      bot.sendMessage(chatId, 'من فضلك، أدخل رقم المعرف وقيمة الرصيد بالشكل التالي:\n`<UserID> <Amount>`');
      bot.once('message', (msg) => {
          const input = msg.text.trim();
          const parts = input.split(' ');

          if (parts.length !== 2) {
              bot.sendMessage(chatId, 'الرجاء إدخال البيانات بالشكل الصحيح: `UserID Amount`\nمثال: `12345 50`');
              return;
          }

          const userId = parseInt(parts[0]);
          const amount = parseFloat(parts[1]);

          if (isNaN(userId) || isNaN(amount) || amount <= 0) {
              bot.sendMessage(chatId, 'الرجاء إدخال قيم صحيحة لـ UserID والرصيد (أكبر من 0).');
              return;
          }
          updateCreditincrement(userId, -amount, (err, changes) => {
              if (err) {
                  bot.sendMessage(chatId, 'حدث خطأ أثناء تحديث الرصيد.');
                  return;
              }
              bot.sendMessage(chatId, `تم تعديل الرصيد بنجاح لمعرف المستخدم: ${userId}. الرصيد المزال: ${amount} $`);
          });
      });
    break;
    case 'resetbalance':
      bot.sendMessage(chatId, 'من فضلك، أدخل رقم المعرف وقيمة الرصيد بالشكل التالي:\n`UserID `');
      bot.once('message', (msg) => {
          const input = msg.text.trim(); 
          const parts = input.split(' ');
          const userId = parseInt(parts[0]);
          updateCredit(userId, 0, (err, changes) => {
              if (err) {
                  bot.sendMessage(chatId, 'حدث خطأ أثناء تحديث الرصيد.');
                  return;
              }
              bot.sendMessage(chatId, `تم تصفير الرصيد بنجاح لمعرف المستخدم: ${userId} $`);
          });
      });
      break;
    default:
        bot.sendMessage(chatId, (language == 'ar') ? 'الأمر غير معروف.' : 'Unknown command.');
        break;
    }
  });
});
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});
