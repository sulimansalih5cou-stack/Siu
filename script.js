// ============================================================
// 🔥 تهيئة Firebase
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    onValue, 
    push, 
    update, 
    remove,
    get 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

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

// ============================================================
// 🌐 متغيرات عامة
// ============================================================
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let userNotifications = [];
let allSettlements = [];
let netBalances = {};

let editingExpenseId = null;
let originalExpenseData = null;

let itemsPerPage = 10;
let currentPage = 1;
let activeFilter = '30days';
let filteredHistory = [];
let isLoadingHistory = false;

let notificationsPerPage = 10;
let currentNotificationPage = 1;
let isLoadingNotifications = false;

let currentSettleUser = '';
let currentSettleMaxAmount = 0;
let currentSettleRecipientUID = '';

let currentHistoryFilter = '30days';
let filteredHistoryRecords = [];
let currentHistoryPage = 1;

// ============================================================
// 🛠️ دوال مساعدة
// ============================================================

function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم غير معروف';
}

function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}

window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
};

function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    const day = dateObj.getDate();
    const month = dateObj.toLocaleString('ar-EG', { month: 'short' });
    const year = dateObj.getFullYear();
    const date = `${day} ${month} ${year}`;
    const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { date, time };
}

// ============================================================
// 🏠 الصفحة الرئيسية - index.html
// ============================================================

function updateHomeDisplay() {
    const balanceEl = document.getElementById('currentBalance');
    const nameEl = document.getElementById('userNamePlaceholder');
    const cardEl = document.getElementById('currentBalanceCard');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');

    if (!balanceEl && !nameEl) return;

    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

    if (nameEl) nameEl.textContent = displayName;
    if (sidebarName) sidebarName.textContent = displayName;
    if (sidebarEmail && auth.currentUser) sidebarEmail.textContent = auth.currentUser.email || '';

    const balance = (currentUserDB && currentUserDB.balance !== undefined) ? currentUserDB.balance : 0;
    if (balanceEl) {
        balanceEl.textContent = balance.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2});
    }

    if (cardEl) {
        if (balance < -0.1) {
            cardEl.classList.add('negative');
        } else {
            cardEl.classList.remove('negative');
        }
    }
}

function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    if (!currentUserID) return;

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <label class="flex items-center w-full cursor-pointer">
                <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-5 w-5 text-blue-600 participant-checkbox">
                <span class="mr-2 font-semibold text-gray-700 select-none">${user.displayName}</span>
            </label>
        `;
        container.appendChild(div);
    });
}

window.selectAllParticipants = function() {
    const checkboxes = document.querySelectorAll('.participant-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
};

// ============================================================
// ✏️ تعديل/حذف المصروف (النسخة القديمة - للتوافق)
// ============================================================

window.showEditExpenseModal = function(expenseId) {
    const expense = allExpenses.find(e => e.firebaseId === expenseId);
    if (!expense) {
        alert('المصروف غير موجود!');
        return;
    }

    if (expense.payer_id !== currentUserID) {
        alert('لا يمكنك تعديل هذا المصروف لأنك لست الدافع!');
        return;
    }

    editingExpenseId = expenseId;
    originalExpenseData = JSON.parse(JSON.stringify(expense));

    document.getElementById('expenseTitle').value = expense.title;
    document.getElementById('expenseAmount').value = expense.total_amount.toLocaleString('en-US');
    document.getElementById('isMessenger').checked = expense.is_messenger || false;

    const checkboxes = document.querySelectorAll('.participant-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = Array.isArray(expense.participants_ids) && expense.participants_ids.includes(cb.dataset.uid);
    });

    const submitBtn = document.querySelector('#expenseForm button[type="button"]');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-save ml-2"></i> تحديث المصروف';
        submitBtn.classList.remove('btn-secondary');
        submitBtn.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        submitBtn.onclick = () => previewExpense(true);
    }

    let cancelBtn = document.getElementById('cancelEditBtn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelEditBtn';
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn mt-3';
        cancelBtn.style.background = '#6B7280';
        cancelBtn.innerHTML = '<i class="fas fa-times ml-2"></i> إلغاء التعديل';
        cancelBtn.onclick = resetEditMode;
        submitBtn.parentNode.appendChild(cancelBtn);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function resetEditMode() {
    editingExpenseId = null;
    originalExpenseData = null;
    
    document.getElementById('expenseForm').reset();
    
    const submitBtn = document.querySelector('#expenseForm button[type="button"]');
    if (submitBtn) {
        submitBtn.innerHTML = 'معاينة وحفظ';
        submitBtn.classList.add('btn-secondary');
        submitBtn.style.background = '';
        submitBtn.onclick = () => previewExpense(false);
    }

    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.remove();
}

async function updateExpense(newData) {
    if (!editingExpenseId || !originalExpenseData) return false;

    try {
        const updates = {};
        const old = originalExpenseData;
        const oldShare = old.share || 0;
        const oldIsMessenger = old.is_messenger || false;
        
        const newShare = newData.share;
        const newIsMessenger = newData.isMessenger;

        const payer = allUsers.find(u => u.uid === old.payer_id);
        let tempPayerBalance = payer?.balance || 0;
        
        if (oldIsMessenger) {
            tempPayerBalance = roundToTwo(tempPayerBalance - (old.total_amount || 0));
        } else {
            tempPayerBalance = roundToTwo(tempPayerBalance - ((old.total_amount || 0) - oldShare));
        }

        const oldParticipants = Array.isArray(old.participants_ids)
            ? old.participants_ids.filter(id => id !== old.payer_id)
            : [];
            
        for (const uid of oldParticipants) {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                const tempBalance = roundToTwo((user.balance || 0) + oldShare);
                updates[`users/${uid}/balance`] = tempBalance;
                user.balance = tempBalance;
            }
        }

        let newPayerAdd;
        if (newIsMessenger) {
            newPayerAdd = newData.amount;
        } else {
            newPayerAdd = roundToTwo(newData.amount - newShare);
        }
        updates[`users/${old.payer_id}/balance`] = roundToTwo(tempPayerBalance + newPayerAdd);

        const newParticipants = newData.participants.filter(id => id !== old.payer_id);
        for (const uid of newParticipants) {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                const currentBalance = updates[`users/${uid}/balance`] || user.balance || 0;
                const finalBalance = roundToTwo(currentBalance - newShare);
                updates[`users/${uid}/balance`] = finalBalance;
            }
        }

        updates[`expenses/${editingExpenseId}`] = {
            title: newData.title,
            total_amount: newData.amount,
            share: newShare,
            payer_id: old.payer_id,
            participants_ids: newData.participants,
            is_messenger: newIsMessenger,
            timestamp: Date.now(),
            edited: true,
            original_timestamp: old.timestamp || Date.now()
        };

        await update(ref(db), updates);

        alert('تم التحديث بنجاح!');
        resetEditMode();
        return true;

    } catch (error) {
        console.error('Error updating expense:', error);
        alert('حدث خطأ: ' + error.message);
        return false;
    }
}

// ============================================================
// 💾 حفظ/تحديث المصروف
// ============================================================

function calculateShare(amount, count) {
    if (count === 0) return 0;
    return roundToTwo(amount / count);
}

window.previewExpense = function(isEdit = false) {
    const title = document.getElementById('expenseTitle').value.trim();
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const isMessenger = document.getElementById('isMessenger').checked;
    const checkboxes = document.querySelectorAll('.participant-checkbox:checked');

    let selectedParticipantsUids = Array.from(checkboxes).map(cb => cb.dataset.uid);
    selectedParticipantsUids.push(currentUserID);
    selectedParticipantsUids = [...new Set(selectedParticipantsUids)];

    if (!title || isNaN(amount) || amount <= 0 || selectedParticipantsUids.length < 2) {
        alert("يرجى إدخال اسم المصروف والمبلغ، وتحديد مشارك واحد على الأقل.");
        return;
    }

    let finalParticipantsUids = selectedParticipantsUids;
    let finalShare;

    if (isMessenger) {
        finalParticipantsUids = selectedParticipantsUids.filter(uid => uid !== currentUserID);
        finalShare = calculateShare(amount, finalParticipantsUids.length);

        if (finalParticipantsUids.length === 0) {
            alert("يجب تحديد مشاركين في وضع المرسال!");
            return;
        }
    } else {
        finalShare = calculateShare(amount, finalParticipantsUids.length);
    }

    const participantsNames = finalParticipantsUids.map(uid => getUserNameById(uid)).join('، ');

    let previewHTML = `
        <p><strong>اسم المصروف:</strong> ${title}</p>
        <p><strong>المبلغ:</strong> ${amount.toLocaleString('en-US')} SDG</p>
        <p><strong>المشاركون:</strong> ${participantsNames}</p>
        <p><strong>الحصة:</strong> ${finalShare.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG</p>
        <p class="mt-4 font-bold text-lg ${isMessenger ? 'text-red-600' : 'text-blue-600'}">
            ${isMessenger ? '🔥' : '💰'} حصتك: ${isMessenger ? '0.00' : finalShare.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG
        </p>
    `;

    if (isEdit) {
        previewHTML += `<p class="mt-2 text-orange-600 font-bold"><i class="fas fa-edit"></i> تعديل مصروف موجود</p>`;
    }

    document.getElementById('previewText').innerHTML = previewHTML;

    window.tempExpenseData = {
        title: title,
        amount: amount,
        share: finalShare,
        participants: finalParticipantsUids,
        isMessenger: isMessenger,
        isEdit: isEdit
    };

    document.getElementById('previewModal').classList.add('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
};

window.handleSaveClick = function() {
    if (!window.tempExpenseData) return;

    const data = window.tempExpenseData;

    if (data.isMessenger) {
        document.getElementById('previewDetails').style.display = 'none';
        document.getElementById('messengerConfirmation').style.display = 'block';
    } else {
        if (data.isEdit) {
            updateExpense(data).then(success => {
                if (success) {
                    hideModal();
                    document.getElementById('successModal').classList.add('show');
                    document.getElementById('expenseForm').reset();
                }
            });
        } else {
            saveExpense();
        }
    }
};

window.saveExpense = async function() {
    const data = window.tempExpenseData;
    if (!data) return;

    const confirmBtn = document.querySelector('#messengerConfirmation button[onclick="saveExpense()"]') || 
                      document.getElementById('mainSaveButton');
    
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'جاري الحفظ...';
    }

    try {
        if (data.isEdit && editingExpenseId) {
            const success = await updateExpense(data);
            if (success) {
                hideModal();
                document.getElementById('successModal').classList.add('show');
                document.getElementById('expenseForm').reset();
            }
        } else {
            const updates = {};
            
            let payerContribution;
            if (data.isMessenger) {
                payerContribution = data.amount;
            } else {
                payerContribution = roundToTwo(data.amount - data.share);
            }

            const oldBalance = currentUserDB?.balance || 0;
            updates[`users/${currentUserID}/balance`] = roundToTwo(oldBalance + payerContribution);

            const participantsToDebit = data.participants.filter(uid => uid !== currentUserID);
            for (const uid of participantsToDebit) {
                const user = allUsers.find(u => u.uid === uid);
                if (user) {
                    const newBalance = roundToTwo((user.balance || 0) - data.share);
                    updates[`users/${uid}/balance`] = newBalance;

                    const newNotifKey = push(ref(db, 'notifications')).key;
                    updates[`notifications/${newNotifKey}`] = {
                        uid: uid,
                        message: `دين جديد: ${data.title}. مطلوب منك ${data.share.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لـ ${getUserNameById(currentUserID)}.`,
                        timestamp: Date.now(),
                        is_read: false,
                        type: 'debit'
                    };
                }
            }

            const newExpenseKey = push(ref(db, 'expenses')).key;
            updates[`expenses/${newExpenseKey}`] = {
                title: data.title,
                total_amount: data.amount,
                share: data.share,
                payer_id: currentUserID,
                participants_ids: data.participants,
                is_messenger: data.isMessenger,
                timestamp: Date.now(),
                edited: false
            };

            await update(ref(db), updates);

            hideModal();
            document.getElementById('successModal').classList.add('show');
            document.getElementById('expenseForm').reset();
        }

    } catch (e) {
        console.error(e);
        alert('حدث خطأ: ' + e.message);
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = data.isEdit ? 'تحديث' : (data.isMessenger ? 'موافق' : 'حفظ');
        }
    }
};

// ============================================================
// 📊 مصروفاتي - my_expenses.html (الجديد)
// ============================================================

function displayMyExpensesPage() {
    if (!window.renderMyExpenses) return;
    
    const myExpenses = allExpenses.filter(e => 
        e.payer_id === currentUserID && !e.is_deleted
    );
    
    window.renderMyExpenses(myExpenses, currentUserID, allUsers, getUserNameById);
}

window.populateEditSelector = function(expenseId) {
    const expense = allExpenses.find(e => e.firebaseId === expenseId);
    if (!expense) return;
    
    const selector = document.getElementById(`selector-${expenseId}`);
    if (!selector) return;
    
    selector.innerHTML = '';
    
    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const isSelected = expense.participants_ids && expense.participants_ids.includes(user.uid);
        const div = document.createElement('div');
        div.className = `participant-option ${isSelected ? 'selected' : ''}`;
        div.onclick = function() {
            const checkbox = this.querySelector('input');
            checkbox.checked = !checkbox.checked;
            this.classList.toggle('selected', checkbox.checked);
        };
        
        div.innerHTML = `
            <input type="checkbox" value="${user.uid}" ${isSelected ? 'checked' : ''} 
                   onclick="event.stopPropagation()">
            <span style="font-weight:600;">${user.displayName}</span>
        `;
        
        selector.appendChild(div);
    });
};

window.saveExpenseEditImpl = async function(expenseId) {
    const expense = allExpenses.find(e => e.firebaseId === expenseId);
    if (!expense || expense.payer_id !== currentUserID) {
        alert('لا يمكنك تعديل هذا المصروف!');
        return;
    }
    
    const selector = document.getElementById(`selector-${expenseId}`);
    const checkboxes = selector.querySelectorAll('input[type="checkbox"]:checked');
    const newParticipants = Array.from(checkboxes).map(cb => cb.value);
    
    if (!newParticipants.includes(currentUserID)) {
        newParticipants.push(currentUserID);
    }
    
    if (newParticipants.length < 2) {
        alert('يجب اختيار مشارك واحد على الأقل!');
        return;
    }
    
    try {
        const oldParticipants = expense.participants_ids || [];
        const oldShare = expense.share || 0;
        const totalAmount = expense.total_amount || 0;
        const isMessenger = expense.is_messenger || false;
        
        const newShare = isMessenger ? 
            roundToTwo(totalAmount / newParticipants.filter(uid => uid !== currentUserID).length) :
            roundToTwo(totalAmount / newParticipants.length);
        
        const updates = {};
        
        const removedParticipants = oldParticipants.filter(uid => !newParticipants.includes(uid) && uid !== currentUserID);
        const addedParticipants = newParticipants.filter(uid => !oldParticipants.includes(uid) && uid !== currentUserID);
        
        for (const uid of removedParticipants) {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                const newBalance = roundToTwo((user.balance || 0) + oldShare);
                updates[`users/${uid}/balance`] = newBalance;
                
                const notifKey = push(ref(db, 'notifications')).key;
                updates[`notifications/${notifKey}`] = {
                    uid: uid,
                    message: `تم إلغاء مشاركتك في مصروف: ${expense.title}`,
                    timestamp: Date.now(),
                    is_read: false,
                    type: 'expense_cancelled'
                };
            }
        }
        
        for (const uid of addedParticipants) {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                const newBalance = roundToTwo((user.balance || 0) - newShare);
                updates[`users/${uid}/balance`] = newBalance;
                
                const notifKey = push(ref(db, 'notifications')).key;
                updates[`notifications/${notifKey}`] = {
                    uid: uid,
                    message: `تمت إضافتك لمصروف: ${expense.title}. مطلوب منك ${newShare.toLocaleString()} SDG`,
                    timestamp: Date.now(),
                    is_read: false,
                    type: 'debit'
                };
            }
        }
        
        const keptParticipants = oldParticipants.filter(uid => 
            newParticipants.includes(uid) && uid !== currentUserID && !isMessenger
        );
        
        if (newShare !== oldShare) {
            for (const uid of keptParticipants) {
                const user = allUsers.find(u => u.uid === uid);
                if (user) {
                    const diff = roundToTwo(newShare - oldShare);
                    const newBalance = roundToTwo((user.balance || 0) - diff);
                    updates[`users/${uid}/balance`] = newBalance;
                }
            }
        }
        
        const payer = allUsers.find(u => u.uid === currentUserID);
        if (payer && !isMessenger) {
            const oldPayerShare = roundToTwo(totalAmount - oldShare);
            const newPayerShare = roundToTwo(totalAmount - newShare);
            const diff = roundToTwo(newPayerShare - oldPayerShare);
            updates[`users/${currentUserID}/balance`] = roundToTwo((payer.balance || 0) + diff);
        }
        
        updates[`expenses/${expenseId}`] = {
            ...expense,
            participants_ids: newParticipants,
            share: newShare,
            edited: true,
            edit_timestamp: Date.now(),
            edit_history: expense.edit_history ? 
                [...expense.edit_history, { timestamp: Date.now(), old_participants: oldParticipants }] :
                [{ timestamp: Date.now(), old_participants: oldParticipants }]
        };
        
        await update(ref(db), updates);
        
        alert('تم تحديث المصروف بنجاح!');
        window.cancelEdit(expenseId);
        
    } catch (error) {
        console.error('Error updating expense:', error);
        alert('حدث خطأ: ' + error.message);
    }
};

window.deleteExpense = async function(expenseId) {
    const expense = allExpenses.find(e => e.firebaseId === expenseId);
    if (!expense || expense.payer_id !== currentUserID) {
        alert('لا يمكنك حذف هذا المصروف!');
        return;
    }
    
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟\nسيتم إعادة حساب جميع الأرصدة وإظهاره كمحذوف في السجل.')) {
        return;
    }
    
    try {
        const updates = {};
        const share = expense.share || 0;
        const isMessenger = expense.is_messenger || false;
        const totalAmount = expense.total_amount || 0;
        
        const payer = allUsers.find(u => u.uid === expense.payer_id);
        if (payer) {
            let refund;
            if (isMessenger) {
                refund = totalAmount;
            } else {
                refund = roundToTwo(totalAmount - share);
            }
            updates[`users/${expense.payer_id}/balance`] = roundToTwo(payer.balance - refund);
        }
        
        const participants = (expense.participants_ids || []).filter(id => id !== expense.payer_id);
        for (const uid of participants) {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                updates[`users/${uid}/balance`] = roundToTwo(user.balance + share);
                
                const notifKey = push(ref(db, 'notifications')).key;
                updates[`notifications/${notifKey}`] = {
                    uid: uid,
                    message: `تم حذف مصروف: ${expense.title} من قبل الدافع`,
                    timestamp: Date.now(),
                    is_read: false,
                    type: 'expense_deleted'
                };
            }
        }
        
        updates[`expenses/${expenseId}`] = {
            ...expense,
            is_deleted: true,
            deleted_at: Date.now(),
            deleted_by: currentUserID
        };
        
        await update(ref(db), updates);
        alert('تم حذف المصروف بنجاح!');
        
    } catch (error) {
        console.error('Error deleting expense:', error);
        alert('حدث خطأ: ' + error.message);
    }
};

// ============================================================
// 💰 ملخص التسوية - summary.html
// ============================================================

function calculateNetBalances() {
    if (!currentUserID || allUsers.length === 0) return;

    netBalances = {};
    allUsers.forEach(user => {
        if (user.uid !== currentUserID) {
            netBalances[user.uid] = 0;
        }
    });

    allExpenses.forEach(expense => {
        if (expense.is_deleted) return;
        
        const payerId = expense.payer_id;
        const share = expense.share || 0;
        const isMessenger = expense.is_messenger || false;

        if (payerId === currentUserID) {
            const participantsToCheck = isMessenger 
                ? (Array.isArray(expense.participants_ids) ? expense.participants_ids.filter(id => id !== currentUserID) : [])
                : (Array.isArray(expense.participants_ids) ? expense.participants_ids.filter(id => id !== currentUserID) : []);

            participantsToCheck.forEach(participantId => {
                if(netBalances[participantId] !== undefined) {
                    netBalances[participantId] = roundToTwo(netBalances[participantId] + share);
                }
            });
        } else if (Array.isArray(expense.participants_ids) && expense.participants_ids.includes(currentUserID)) {
            if(netBalances[payerId] !== undefined) {
                netBalances[payerId] = roundToTwo(netBalances[payerId] - share);
            }
        }
    });

    allSettlements.forEach(settlement => {
        if (settlement.is_deleted) return;
        
        const { payer_id, recipient_id, amount } = settlement;

        if (payer_id === currentUserID && netBalances[recipient_id] !== undefined) {
            netBalances[recipient_id] = roundToTwo(netBalances[recipient_id] + amount);
        } else if (recipient_id === currentUserID && netBalances[payer_id] !== undefined) {
            netBalances[payer_id] = roundToTwo(netBalances[payer_id] - amount);
        }
    });
}

function updateSummaryDisplay() {
    const totalDebtEl = document.getElementById('totalDebt');
    const totalCreditEl = document.getElementById('totalCredit');
    const debtContainer = document.getElementById('debtContainer');
    const claimList = document.getElementById('claimList');
    const noDebtsEl = document.getElementById('noDebts');

    if (!totalDebtEl || !totalCreditEl) return;

    let totalDebt = 0;
    let totalCredit = 0;
    let hasDebtItems = false;
    let hasClaimItems = false;

    if (debtContainer) debtContainer.innerHTML = '';
    if (claimList) claimList.innerHTML = '';

    Object.keys(netBalances).forEach(otherUID => {
        const netAmount = netBalances[otherUID];
        const otherUserName = getUserNameById(otherUID);

        if (Math.abs(netAmount) < 0.1) return;

        if (netAmount < 0) {
            const amount = Math.abs(netAmount);
            totalDebt += amount;
            hasDebtItems = true;

            if (debtContainer) {
                const debtHTML = `
                    <div class="balance-card">
                        <div class="balance-info">
                            <span class="balance-name">${otherUserName}</span>
                            <span class="balance-amount">${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
                        </div>
                        <button class="action-button" onclick="showSettleModal('${otherUserName}', ${amount}, '${otherUID}')">
                            تسوية
                        </button>
                    </div>
                `;
                debtContainer.innerHTML += debtHTML;
            }

        } else if (netAmount > 0) {
            const amount = netAmount;
            totalCredit += amount;
            hasClaimItems = true;

            if (claimList) {
                const claimHTML = `
                    <div class="claim-item">
                        <span class="font-semibold">${otherUserName}</span>
                        <div class="flex items-center gap-3">
                            <span class="text-green-600 font-bold">${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
                            <button class="nudge-button-individual" onclick="nudgeUser('${otherUserName}', '${otherUID}')">
                                نكز
                            </button>
                        </div>
                    </div>
                `;
                claimList.innerHTML += claimHTML;
            }
        }
    });

    totalDebtEl.innerHTML = `${roundToTwo(totalDebt).toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;
    totalCreditEl.innerHTML = `${roundToTwo(totalCredit).toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;

    if (noDebtsEl) {
        if (!hasDebtItems) {
            noDebtsEl.classList.remove('hidden');
            if (debtContainer) debtContainer.innerHTML = '';
        } else {
            noDebtsEl.classList.add('hidden');
        }
    }

    if (claimList && !hasClaimItems) {
        claimList.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد مستحقات</p>';
    }
}

// ============================================================
// 📜 السجل - history.html (الجديد)
// ============================================================

function combineAndSortHistory() {
    const combined = [];

    allExpenses.forEach(expense => {
        if (!expense || typeof expense !== 'object') return;
        
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = Array.isArray(expense.participants_ids) && 
                              expense.participants_ids.includes(currentUserID);

        if (isPayer || isParticipant) {
            combined.push({
                type: 'expense',
                ...expense,
                timestamp: expense.timestamp || 0
            });
        }
    });

    allSettlements.forEach(settlement => {
        if (!settlement || typeof settlement !== 'object') return;
        
        if (settlement.payer_id === currentUserID || settlement.recipient_id === currentUserID) {
            combined.push({
                type: 'settlement',
                ...settlement,
                timestamp: settlement.timestamp || 0
            });
        }
    });

    return combined.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function displayHistoryNew() {
    if (!window.renderHistoryCards) return;
    
    const combined = combineAndSortHistory();
    const now = Date.now();
    
    filteredHistoryRecords = combined.filter(record => {
        const recordTime = record.timestamp || 0;
        
        if (currentHistoryFilter === '30days') {
            return recordTime >= now - (30 * 24 * 60 * 60 * 1000);
        } else if (currentHistoryFilter === '3months') {
            return recordTime >= now - (90 * 24 * 60 * 60 * 1000);
        } else if (currentHistoryFilter === 'incoming') {
            if (record.type === 'settlement' && record.recipient_id === currentUserID) return true;
            if (record.type === 'expense' && record.payer_id === currentUserID) return true;
            return false;
        } else if (currentHistoryFilter === 'outgoing') {
            if (record.type === 'settlement' && record.payer_id === currentUserID) return true;
            if (record.type === 'expense' && 
                Array.isArray(record.participants_ids) && 
                record.participants_ids.includes(currentUserID) && 
                record.payer_id !== currentUserID) return true;
            return false;
        }
        return true;
    });
    
    window.filteredHistoryRecords = filteredHistoryRecords;
    window.currentHistoryPage = currentHistoryPage;
    
    window.renderHistoryCards(filteredHistoryRecords, currentUserID, allUsers, getUserNameById);
}

window.filterHistoryFromJS = function(filterType) {
    currentHistoryFilter = filterType;
    currentHistoryPage = 1;
    displayHistoryNew();
};

window.loadMoreFromJS = function() {
    currentHistoryPage++;
    window.currentHistoryPage = currentHistoryPage;
    window.renderHistoryCards(filteredHistoryRecords, currentUserID, allUsers, getUserNameById);
};

// ============================================================
// 🔔 الإشعارات
// ============================================================

function loadNotifications() {
    if (!currentUserID) return;

    onValue(ref(db, 'notifications'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            userNotifications = Object.keys(val)
                .map(key => ({ id: key, ...val[key] }))
                .filter(n => n.uid === currentUserID)
                .sort((a, b) => b.timestamp - a.timestamp);
            
            currentNotificationPage = 1;
            displayNotifications();
        } else {
            userNotifications = [];
            displayNotifications();
        }
    });
}

function displayNotifications() {
    const listContainer = document.getElementById('notificationsList');
    const badge = document.getElementById('notificationBadge');

    if (!listContainer || !badge) return;

    listContainer.innerHTML = '';

    const unreadCount = userNotifications.filter(n => !n.is_read).length;
    badge.textContent = unreadCount.toString();
    badge.classList.toggle('hidden', unreadCount === 0);

    const notificationsToShow = userNotifications.slice(0, currentNotificationPage * notificationsPerPage);

    if (notificationsToShow.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد إشعارات</p>';
        return;
    }

    notificationsToShow.forEach(notification => {
        const notifHTML = `
            <div class="p-3 rounded-lg ${notification.is_read ? 'bg-gray-50' : 'bg-blue-50'} border cursor-pointer mb-2"
                 onclick="markNotificationAsRead('${notification.id}')">
                <p class="text-sm ${notification.is_read ? 'text-gray-600' : 'font-semibold text-gray-800'}">
                    ${notification.message}
                </p>
                <p class="text-xs text-gray-400 mt-1">${formatBankDate(notification.timestamp).date}</p>
            </div>
        `;
        listContainer.innerHTML += notifHTML;
    });
}

window.markNotificationAsRead = async function(notificationId) {
    if(!db) return;
    try {
        await update(ref(db, `notifications/${notificationId}`), { is_read: true });
    } catch(e) {
        console.error(e);
    }
};

window.nudgeUser = async function(userName, userId) {
    if (!confirm(`إرسال تذكير لـ ${userName}؟`)) return;

    try {
        const newNotifKey = push(ref(db, 'notifications')).key;
        await update(ref(db), {
            [`notifications/${newNotifKey}`]: {
                uid: userId,
                message: `${getUserNameById(currentUserID)} يرسل لك تذكيراً بالدفع!`,
                timestamp: Date.now(),
                is_read: false,
                type: 'nudge'
            }
        });
        alert('تم إرسال التذكير!');
    } catch (e) {
        alert('حدث خطأ: ' + e.message);
    }
};

window.sendClaimNotification = async function() {
    try {
        const updates = {};
        Object.keys(netBalances).forEach(uid => {
            if (netBalances[uid] > 0) {
                const newNotifKey = push(ref(db, 'notifications')).key;
                updates[`notifications/${newNotifKey}`] = {
                    uid: uid,
                    message: `مطالبة: ${getUserNameById(currentUserID)} يطالبك بدفع ${netBalances[uid].toLocaleString()} SDG`,
                    timestamp: Date.now(),
                    is_read: false,
                    type: 'claim'
                };
            }
        });

        if (Object.keys(updates).length === 0) {
            alert('لا يوجد مستحقات للمطالبة بها!');
            return;
        }

        await update(ref(db), updates);
        alert('تم إرسال المطالبة!');
        hideClaimModal();
    } catch (e) {
        alert('حدث خطأ: ' + e.message);
    }
};

// ============================================================
// 💰 التسوية
// ============================================================

window.showSettleModal = function(userName, amount, uid) {
    currentSettleUser = userName;
    currentSettleMaxAmount = amount;
    currentSettleRecipientUID = uid;

    const modal = document.getElementById('settleModal');
    const relationEl = document.getElementById('settleRelation');
    const maxAmountEl = document.getElementById('maxSettleAmountDisplay');
    const amountInput = document.getElementById('settleAmount');

    if (relationEl) relationEl.textContent = `تسوية الدين لـ ${userName}`;
    if (maxAmountEl) maxAmountEl.textContent = amount.toLocaleString(undefined, {minimumFractionDigits: 2});
    if (amountInput) {
        amountInput.value = amount;
        amountInput.max = amount;
        amountInput.dispatchEvent(new Event('input'));
    }

    if (modal) modal.classList.add('show');
};

window.hideSettleModal = function() {
    const modal = document.getElementById('settleModal');
    const form = document.getElementById('settleForm');
    
    if (modal) modal.classList.remove('show');
    if (form) form.reset();

    currentSettleUser = '';
    currentSettleMaxAmount = 0;
    currentSettleRecipientUID = '';
};

window.sendSettleTransaction = async function(recipientUID, amount, opNumber) {
    if (!currentUserID || !recipientUID || amount <= 0) return false;

    try {
        const updates = {};
        const payerName = getUserNameById(currentUserID);
        const payer = allUsers.find(u => u.uid === currentUserID);
        const recipient = allUsers.find(u => u.uid === recipientUID);

        if (!payer || !recipient) return false;

        updates[`users/${currentUserID}/balance`] = roundToTwo((payer.balance || 0) + amount);
        updates[`users/${recipientUID}/balance`] = roundToTwo((recipient.balance || 0) - amount);

        const newSettleKey = push(ref(db, 'settlements')).key;
        updates[`settlements/${newSettleKey}`] = {
            payer_id: currentUserID,
            recipient_id: recipientUID,
            amount: amount,
            operation_number: opNumber,
            timestamp: Date.now()
        };

        const newNotifKey = push(ref(db, 'notifications')).key;
        updates[`notifications/${newNotifKey}`] = {
            uid: recipientUID,
            message: `${payerName} سدد لك ${amount.toLocaleString()} SDG`,
            timestamp: Date.now(),
            is_read: false,
            type: 'settlement_received'
        };

        await update(ref(db), updates);
        return true;

    } catch (e) {
        console.error(e);
        return false;
    }
};

// ============================================================
// 🎛️ التحكم في المودالات
// ============================================================

window.hideModal = function() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        modal.classList.remove('show');
        const previewDetails = document.getElementById('previewDetails');
        const messengerConfirmation = document.getElementById('messengerConfirmation');
        if (previewDetails) previewDetails.style.display = 'block';
        if (messengerConfirmation) messengerConfirmation.style.display = 'none';
    }
};

window.hideSuccessModal = function() {
    const modal = document.getElementById('successModal');
    if (modal) modal.classList.remove('show');
};

window.showNotifications = function() {
    const modal = document.getElementById('notificationModal');
    if (modal) {
        currentNotificationPage = 1;
        displayNotifications();
        modal.classList.add('show');
    }
};

window.hideNotificationModal = function() {
    const modal = document.getElementById('notificationModal');
    if (modal) modal.classList.remove('show');
};

window.hideClaimModal = function() {
    const modal = document.getElementById('claimModal');
    if (modal) modal.classList.remove('show');
};

window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : 'auto';
    }
};

window.closeSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
};

// ============================================================
// 🔄 تحميل البيانات
// ============================================================

function loadData() {
    if (!currentUserID) return;

    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            
            updateHomeDisplay();
            populateParticipants();
            
            if (window.location.href.includes('summary.html')) {
                calculateNetBalances();
                updateSummaryDisplay();
            }
        }
    });

    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ 
                firebaseId: key, 
                ...val[key] 
            })).sort((a, b) => b.timestamp - a.timestamp);
        } else {
            allExpenses = [];
        }

        if (window.location.href.includes('my_expenses.html')) {
            displayMyExpensesPage();
        }
        if (window.location.href.includes('summary.html')) {
            calculateNetBalances();
            updateSummaryDisplay();
        }
        if (window.location.href.includes('history.html')) {
            if (window.renderHistoryCards) {
                displayHistoryNew();
            }
        }
    });

    onValue(ref(db, 'settlements'), (snapshot) => {
        if (snapshot.exists()) {
            allSettlements = Object.keys(snapshot.val()).map(key => ({
                firebaseId: key,
                ...snapshot.val()[key]
            }));
        } else {
            allSettlements = [];
        }

        if (window.location.href.includes('summary.html')) {
            calculateNetBalances();
            updateSummaryDisplay();
        }
        if (window.location.href.includes('history.html')) {
            if (window.renderHistoryCards) {
                displayHistoryNew();
            }
        }
    });

    loadNotifications();
}

// ============================================================
// 🔐 المصادقة
// ============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();

        const logoutBtns = document.querySelectorAll('#logoutSidebarButton, #logoutBtn');
        logoutBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    signOut(auth).then(() => {
                        window.location.href = 'auth.html';
                    });
                });
            }
        });

    } else {
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});

// ============================================================
// 📋 أحداث DOM
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('menuButton');
    if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);

    const settleForm = document.getElementById('settleForm');
    if (settleForm) {
        settleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const opNum = document.getElementById('operationNumber').value;
            const amount = parseFloat(document.getElementById('settleAmount').value);

            if (opNum.length < 4) {
                alert('يرجى إدخال رقم عملية صحيح');
                return;
            }

            if (amount <= 0 || amount > currentSettleMaxAmount) {
                alert('المبلغ غير صحيح');
                return;
            }

            const success = await sendSettleTransaction(
                currentSettleRecipientUID, 
                amount, 
                opNum.slice(-4)
            );

            if (success) {
                alert('تمت التسوية!');
                hideSettleModal();
            } else {
                alert('فشلت التسوية');
            }
        });
    }

    const settleAmountInput = document.getElementById('settleAmount');
    if (settleAmountInput) {
        settleAmountInput.addEventListener('input', function() {
            const paid = parseFloat(this.value) || 0;
            const max = parseFloat(this.getAttribute('max')) || 0;
            const remaining = max - paid;
            
            const remainingDisplay = document.getElementById('remainingBalance');
            const remainingValue = document.getElementById('remainingValue');

            if (remainingDisplay && remainingValue) {
                if (paid > 0) {
                    remainingDisplay.classList.remove('hidden');
                    remainingValue.textContent = remaining.toLocaleString(undefined, {minimumFractionDigits: 2}) + ' SDG';
                    remainingDisplay.style.backgroundColor = remaining > 0 ? '#FEF3C7' : '#D1FAE5';
                    remainingDisplay.style.color = remaining > 0 ? '#B45309' : '#059669';
                } else {
                    remainingDisplay.classList.add('hidden');
                }
            }
        });
    }

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
});
