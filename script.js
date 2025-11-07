// 🔥 1. تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";
// 💡 استيراد تحديثات Firebase الضرورية
import { getDatabase, ref, onValue, set, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 قم بتحديث هذه الإعدادات ببيانات مشروعك الحقيقية
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

// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app); 
const auth = getAuth(app); 

// 💾 2. هيكلة البيانات والمتغيرات الأساسية
let allUsers = []; 
let expenses = []; 
let currentUserID = null; 
let currentUserName = null; 
let currentUserDB = null; 

// ⚙️ 3. وظائف تحديث الواجهة والـ DOM والتنسيق

function formatNumber(input) {
    // تنسيق الأرقام بفاصلة الألف
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US'); 
    }
}

function updateBalanceDisplay() {
    if (!currentUserDB || !currentUserName) return;

    const balanceCard = document.getElementById('currentBalanceCard');
    const balanceElement = document.getElementById('currentBalance');
    const userNamePlaceholder = document.getElementById('userNamePlaceholder');

    userNamePlaceholder.textContent = currentUserName;

    const balanceValue = currentUserDB.balance;
    
    // تحديد الإشارة وعرض الرصيد
    const sign = balanceValue >= 0 ? '+' : '';
    const formattedBalance = sign + Math.abs(balanceValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    balanceElement.textContent = formattedBalance;

    // تحديث لون البطاقة بناءً على الرصيد (موجب/سالب)
    balanceCard.classList.remove('negative');
    balanceCard.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
    if (balanceValue < 0) {
        balanceCard.classList.add('negative'); // يطبق اللون الأحمر
    }
}

function populateParticipants() {
    const participantsContainer = document.getElementById('participantsCheckboxes');
    participantsContainer.innerHTML = '';

    // عرض جميع المستخدمين ما عدا المستخدم الحالي
    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `
            <input type="checkbox" data-user-id="${user.uid}" value="${user.displayName}">
            <span class="checkbox-icon fas fa-user ml-2"></span> ${user.displayName}
        `;
        participantsContainer.appendChild(label);
    });
}

function selectAllParticipants() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
}

// 📝 4. منطق قراءة وكتابة البيانات عبر Firebase

function loadDataFromFirebase() {
    if (!currentUserID) return; 

    // الاستماع لتغييرات المستخدمين (الأرصدة)
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const usersObject = snapshot.val();
            // تحويل البيانات من كائن إلى مصفوفة (مع UID كـ key)
            allUsers = Object.keys(usersObject).map(uid => ({ 
                uid: uid,
                ...usersObject[uid]
            }));
            
            currentUserDB = allUsers.find(u => u.uid === currentUserID);

            populateParticipants();
            updateBalanceDisplay();
        }
    });

    // الاستماع لتغييرات المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const expensesObject = snapshot.val();
            expenses = Object.keys(expensesObject).map(key => ({ 
                firebaseId: key,
                ...expensesObject[key] 
            }));
        } else {
             expenses = [];
        }
    });
}

// 💡 دالة الحفظ الرئيسية (تنفذ المنطق الحسابي وتحديث Firebase)
async function saveExpense() {
    if (!currentUserID || !currentUserDB) return;

    const title = document.getElementById('expenseTitle').value;
    const rawAmount = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(rawAmount); 

    if (isNaN(amount) || amount <= 0) {
         alert('يرجى إدخال مبلغ صحيح.');
         return;
    }

    const participantUIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-user-id'));

    participantUIDs.push(currentUserID); // إضافة الدافع لنفسه

    const totalParticipants = participantUIDs.length;
    const share = amount / totalParticipants;

    const usersUpdate = {}; // الكائن الذي سيتم كتابته إلى Firebase

    allUsers.forEach(user => {
        let newBalance = user.balance;

        // 1. حساب الدافع
        if (user.uid === currentUserID) {
            const netPaidForOthers = amount - share; // صافي المبلغ المدفوع نيابة عن الآخرين
            newBalance = parseFloat((newBalance + netPaidForOthers).toFixed(2));
        } 
        // 2. حساب المشاركين الآخرين
        else if (participantUIDs.includes(user.uid)) {
            newBalance = parseFloat((newBalance - share).toFixed(2)); // خصم الحصة
        }
        
        // إعداد البيانات للكتابة (سواء تغير الرصيد أم لا)
        usersUpdate[user.uid] = {
            displayName: user.displayName, 
            balance: newBalance,
        };
    });

    const newExpense = {
        title: title,
        amount: amount,
        payer_id: currentUserID, 
        participants_ids: participantUIDs,
        share: parseFloat(share.toFixed(2)),
        date: new Date().toISOString().split('T')[0]
    };

    try {
        // 🛑 التحديث الجماعي: هذا يتطلب قواعد أمان تسمح بـ ".write": "auth != null" على مسار /users
        await set(ref(db, 'users'), usersUpdate);
        // إضافة المصروف الجديد
        await push(ref(db, 'expenses'), newExpense);

        hideModal();
        showSuccessModal(); 

        // إعادة تعيين النموذج بعد النجاح
        document.getElementById('expenseForm').reset();
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);

    } catch (error) {
        alert("فشل في حفظ البيانات إلى Firebase. تحقق من اتصالك وقواعد الأمان.");
        console.error("Firebase Save Error:", error);
    }
}

// 5. وظائف المعاينة والـ Modal
function showSuccessModal() {
    document.getElementById('successModal').classList.add('show');
}

function hideSuccessModal() {
    document.getElementById('successModal').classList.remove('show');
}

function previewExpense() {
    if (!currentUserDB) {
        alert("الرجاء الانتظار حتى يتم تحميل بيانات المستخدمين.");
        return;
    }
    
    const title = document.getElementById('expenseTitle').value;
    const rawAmount = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(rawAmount);

    const selectedParticipantUIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-user-id'));

    if (!title || isNaN(amount) || amount <= 0) {
        alert('يرجى ملء اسم المصروف وإدخال مبلغ صحيح!');
        return;
    }

    const totalParticipants = selectedParticipantUIDs.length + 1; 
    const share = amount / totalParticipants;

    const netPaidForOthers = amount - share;
    const projectedNewBalance = currentUserDB.balance + netPaidForOthers;

    const participantNames = selectedParticipantUIDs
        .map(uid => allUsers.find(u => u.uid === uid)?.displayName)
        .filter(name => name)
        .join(', ');

    const previewText = `
        <strong>المصروف:</strong> ${title}<br>
        <strong>المبلغ الكلي:</strong> ${amount.toLocaleString('en-US')}<br>
        <strong>المشاركون (بالإضافة إليك):</strong> ${participantNames || 'أنت فقط'}<br>
        <strong>نصيب كل شخص:</strong> ${share.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br>
        <hr style="margin: 10px 0;">
        <span class="text-blue-600 font-bold">رصيدك المتوقع بعد الحفظ: ${projectedNewBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    `;
    document.getElementById('previewText').innerHTML = previewText;

    const today = new Date().toISOString().split('T')[0];
    const hasTodayExpense = expenses.some(e => e.payer_id === currentUserID && e.date === today && e.title === title);
    document.getElementById('warning').style.display = hasTodayExpense ? 'block' : 'none';

    document.getElementById('previewModal').classList.add('show');
}

function hideModal() {
    document.getElementById('previewModal').classList.remove('show');
}


// 6. مراقبة حالة المصادقة (Auth State) وتجهيز البيانات
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        currentUserName = user.displayName;
        loadDataFromFirebase();
        
        document.getElementById('logoutButton').onclick = (e) => {
             e.preventDefault();
             auth.signOut().then(() => {
                window.location.href = 'auth.html'; 
             });
        }
        
    } else {
        window.location.href = 'auth.html'; 
    }
});

// *إتاحة الدوال للـ HTML*
window.formatNumber = formatNumber;
window.selectAllParticipants = selectAllParticipants;
window.previewExpense = previewExpense;
window.saveExpense = saveExpense;
window.hideModal = hideModal;
window.hideSuccessModal = hideSuccessModal;
