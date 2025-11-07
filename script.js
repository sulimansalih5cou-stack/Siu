// ... (جميع الاستيرادات والتهيئة) ...

// 💡 دالة الحفظ الرئيسية (الكود النهائي المصحح)
async function saveExpense() {
    if (!currentUserID || !currentUserDB) return;

    const title = document.getElementById('expenseTitle').value;
    const rawAmount = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(rawAmount); 

    // ... (التحقق من المبلغ) ...

    const participantUIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-user-id'));

    participantUIDs.push(currentUserID); 

    const totalParticipants = participantUIDs.length;
    const share = amount / totalParticipants;

    const usersUpdate = {};

    allUsers.forEach(user => {
        let newBalance = user.balance;

        // 1. حساب الدافع (Payer)
        if (user.uid === currentUserID) {
            // المبلغ الذي يضاف هو صافي ما دفعه الدافع نيابة عن الآخرين
            const netPaidForOthers = amount - share; 
            newBalance = parseFloat((newBalance + netPaidForOthers).toFixed(2));
        } 
        // 2. حساب المشاركين الآخرين (Participant)
        else if (participantUIDs.includes(user.uid)) {
            // المبلغ الذي يخصم هو حصة المشارك بالكامل
            newBalance = parseFloat((newBalance - share).toFixed(2));
        }
        
        usersUpdate[user.uid] = {
            displayName: user.displayName, 
            balance: newBalance,
        };
    });

    // ... (إعداد المصروف الجديد وحفظه في Firebase) ...
    // ... (بقية الإجراءات: hideModal, showSuccessModal, reset form)
}

// ... (بقية الكود) ...
