const fs = require('fs');

// قراءة البيانات من ملف JSON
fs.readFile('./config/payeer_data.json', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading JSON file:', err.message);
    return;
  }
  
  data = JSON.parse(data);
  console.log(data);
//   try {
//     const stdout = JSON.parse(data);
//     if (userEnteredId === parseInt(stdout.id)) {
//       // استمر في عملية إضافة السجل وتحديث الرصيد كما هو مذكور في الكود
//     } else {
//       bot.sendMessage(chatId, (language == 'ar') ? 'رقم المعاملة غير صحيح.' : 'Transaction ID is incorrect.');
//     }
//   } catch (err) {
//     console.error('Error parsing JSON:', err.message);
//   }
});
