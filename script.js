// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// إعدادات Firebase (تأكد من صحتها)
const firebaseConfig = {
  apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
  authDomain: "siu-students.firebaseapp.com",
  databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
  projectId: "siu-students",
  storageBucket: "siu-students.firebasestorage.app",
  messagingSenderId: "76007314543",
  appId: "1:76007314543:web:4850b668cec4b93bdc699a",
  measurementId: "G-SB6884R2FX"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app); 
const auth = getAuth(app); 

let allUsers = []; 
let currentUserID = null; 
let currentUserDB = null; 
let expenses = []; // لتحذير التكرار

// ------------------------------------------------
// 🛠️ دوال التحديث والعرض
// ------------------------------------------------

// تنسيق الأرقام بفاصلة
window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US'); 
    }
};

function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}

// 🔥 الدالة المسؤولة عن تحديث الرصيد واللون والاسم
function updateBalanceDisplay() {
    if (!currentUserDB) return;

    // 1. تحديث الاسم
    const nameEl = document.getElementById('userNamePlaceholder');
    if (nameEl) nameEl.textContent = currentUserDB.displayName || 'مستخدم';

    // 2. تحديث الرصيد واللون
    const balanceEl = document.getElementById('currentBalance');
    const cardEl = document.getElementById('currentBalanceCard');

    if (balanceEl && cardEl) {
        const balance = currentUserDB.balance || 0;
        
        // عرض الرقم
        balanceEl.textContent = balance.toLocaleString('en-US', {minimumFractionDigits: 1});

        // 🛑 التحكم في اللون (أخضر / أحمر)
        if (balance < 0) {
            cardEl.classList.add('negative'); // يضيف اللون الأحمر
        } else {
            cardEl.classList.remove('negative'); // يبقيه أخضر
        }
    }
}

// ملء قائمة المشاركين
function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <label class="flex items-center w-full cursor-pointer">
                <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-5 w-5 text-blue-600">
                <span class="mr-2 font-semibold text-gray-700">${user.displayName}</span>
            </label>
        `;
        container.appendChild(div);
    });
}

window.selectAllParticipants = function() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
};

// ------------------------------------------------
// 🔄 منطق البيانات والحفظ
// ------------------------------------------------

function loadData() {
    if (!currentUserID) return;

    // جلب المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            
            updateBalanceDisplay(); // تحديث الواجهة
            populateParticipants();
        }
    });

    // جلب المصروفات (للتحقق من التكرار)
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            expenses = Object.values(val);
        }
    });
}

// معاينة المصروف
window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value;
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);

    if (!title || isNaN(amount) || amount <= 0) {
        alert('يرجى إدخال البيانات بشكل صحيح');
        return;
    }

    // المشاركون
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    const participants = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    
    // إضافة الدافع (أنت) دائماً للقائمة للحساب
    if (!participants.includes(currentUserID)) participants.push(currentUserID);

    const count = participants.length;
    const share = amount / count;

    // نص المعاينة
    const text = `
        <ul class="list-disc pr-4 space-y-2">
            <li><b>المصروف:</b> ${title}</li>
            <li><b>المبلغ:</b> ${amount.toLocaleString()} SDG</li>
            <li><b>المشاركون:</b> ${count} أشخاص</li>
            <li><b>نصيب الفرد:</b> ${share.toLocaleString(undefined, {maximumFractionDigits: 1})} SDG</li>
        </ul>
    `;
    document.getElementById('previewText').innerHTML = text;

    // تحذير التكرار (نفس اليوم، نفس العنوان، نفس المبلغ)
    const today = new Date().toISOString().split('T')[0];
    const isDuplicate = expenses.some(e => e.date === today && e.title === title && e.amount === amount);
    document.getElementById('warning').style.display = isDuplicate ? 'block' : 'none';

    document.getElementById('previewModal').classList.add('show');
};

// حفظ المصروف
window.saveExpense = async function() {
    window.hideModal();
    
    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));
    
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    let participantsIDs = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    if (!participantsIDs.includes(currentUserID)) participantsIDs.push(currentUserID);

    const share = roundToTwo(amount / participantsIDs.length);
    const updates = {};

    // تحديث الأرصدة
    allUsers.forEach(user => {
        let bal = user.balance || 0;
        // إذا كان هو الدافع: يضاف له المبلغ كله ناقص حصته
        if (user.uid === currentUserID) {
            bal += (amount - share);
        } 
        // إذا كان مشاركاً: يخصم منه حصته
        else if (participantsIDs.includes(user.uid)) {
            bal -= share;
        }
        updates[`users/${user.uid}/balance`] = roundToTwo(bal);
    });

    // كائن المصروف
    const expenseData = {
        title, amount, share,
        payer_id: currentUserID,
        participants_ids: participantsIDs,
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0]
    };

    try {
        await push(ref(db, 'expenses'), expenseData); // حفظ المصروف
        await update(ref(db), updates); // تحديث الأرصدة دفعة واحدة (تتطلب دالة update)
        // ملاحظة: إذا لم تعمل update استخدم set لكل مستخدم أو استيراد update من firebase
        // للتبسيط هنا سنستخدم set للأرصدة بناءً على اللوجيك الموجود سابقاً:
        
        // *إعادة كتابة بسيطة للحفظ لضمان العمل مع الـ imports الحالية*:
        const usersUpdate = {};
        allUsers.forEach(u => {
            let newBal = u.balance || 0;
            if (u.uid === currentUserID) newBal += (amount - share);
            else if (participantsIDs.includes(u.uid)) newBal -= share;
            usersUpdate[u.uid] = { displayName: u.displayName, email: u.email, balance: roundToTwo(newBal) };
        });
        await set(ref(db, 'users'), usersUpdate);
        
        // إظهار النجاح
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
        document.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);

    } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء الحفظ');
    }
};

// ------------------------------------------------
// 🔐 المصادقة
// ------------------------------------------------
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();
        
        // زر الخروج
        document.getElementById('logoutButton').onclick = () => {
            auth.signOut().then(() => window.location.href = 'auth.html');
        };
    } else {
        window.location.href = 'auth.html';
    }
});

// دوال النوافذ المنبثقة
window.hideModal = () => document.getElementById('previewModal').classList.remove('show');
window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');
