<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Kiosk - Chelan High Pass System</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .bg-chelan { background-color: #0d5235; }
        .text-chelan { color: #0d5235; }
        .border-chelan { border-color: #0d5235; }
    </style>
</head>
<body class="bg-slate-100 text-slate-800 font-sans min-h-screen flex flex-col items-center justify-center p-4">

    <!-- Header / Nav link back to Dashboard -->
    <div class="fixed top-4 right-4 z-10">
        <a href="teacher.html" class="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-lg shadow-md transition">Teacher View 🔒</a>
    </div>

    <div class="max-w-xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 space-y-6 text-center">
        <div class="flex justify-center items-center gap-3 mb-2">
            <img src="https://assets-rst7.rschooltoday.com/rst7files/uploads/sites/396/2025/08/12090756/Logo-Header.png" alt="Logo" class="h-12">
            <h1 class="text-2xl font-black text-chelan tracking-wide">Chelan High Pass System</h1>
        </div>

        <div id="status-message" class="min-h-[2rem] text-sm font-bold text-slate-500">
            Scan your student ID barcode or type your ID to begin.
        </div>

        <!-- Main Input Form -->
        <form id="kiosk-form" class="space-y-4">
            <input type="text" id="student-id-input" placeholder="Scan or Enter ID" autofocus required autocomplete="off"
                class="w-full text-center font-mono text-2xl tracking-wider px-4 py-4 bg-slate-50 border-2 border-slate-300 rounded-2xl focus:outline-none focus:border-chelan">

            <div id="pocket-selection" class="hidden space-y-2">
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider">Select Pocket Number:</label>
                <input type="number" id="pocket-input" min="1" max="50" placeholder="Pocket #"
                    class="w-full text-center font-mono text-2xl px-4 py-3 bg-slate-50 border-2 border-slate-300 rounded-2xl focus:outline-none focus:border-chelan">
            </div>

            <!-- Action Selectors -->
            <div class="grid grid-cols-3 gap-3 pt-2">
                <button type="button" onclick="handleAction('phone')" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-4 rounded-2xl shadow transition text-sm flex flex-col items-center gap-1">
                    <span class="text-xl">📱</span>
                    <span>Phone Check In/Out</span>
                </button>
                <button type="button" onclick="handleAction('bathroom')" class="bg-red-700 hover:bg-red-800 text-white font-bold py-4 rounded-2xl shadow transition text-sm flex flex-col items-center gap-1">
                    <span class="text-xl">🚻</span>
                    <span>Bathroom Pass</span>
                </button>
                <button type="button" onclick="handleAction('hall')" class="bg-indigo-700 hover:bg-indigo-800 text-white font-bold py-4 rounded-2xl shadow transition text-sm flex flex-col items-center gap-1">
                    <span class="text-xl">🎟️</span>
                    <span>Hall Pass</span>
                </button>
            </div>
        </form>

        <!-- Unrecognized Student Modal / Form -->
        <div id="new-student-modal" class="hidden bg-amber-50 border-2 border-amber-300 p-6 rounded-2xl text-left space-y-4">
            <h3 class="font-bold text-amber-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <span>⚠️</span> Unrecognized ID
            </h3>
            <p class="text-xs text-amber-800">Your ID was not found in the roster. Enter your name below to request teacher approval.</p>
            <div class="grid grid-cols-2 gap-2">
                <input type="text" id="new-first-name" placeholder="First Name" class="text-xs px-3 py-2 border border-amber-300 rounded-lg bg-white focus:outline-none">
                <input type="text" id="new-last-name" placeholder="Last Name" class="text-xs px-3 py-2 border border-amber-300 rounded-lg bg-white focus:outline-none">
            </div>
            <div class="flex gap-2">
                <button type="button" onclick="submitPendingStudent()" class="w-full bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold py-2 rounded-lg transition">Submit Request</button>
                <button type="button" onclick="cancelPendingStudent()" class="bg-slate-300 hover:bg-slate-400 text-slate-800 text-xs font-bold px-4 py-2 rounded-lg transition">Cancel</button>
            </div>
        </div>
    </div>

    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getDatabase, ref, get, set, remove, push } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

        const firebaseConfig = {
            apiKey: "AIzaSyDOqjLMzMydaR31WWUA35sr1FrNLfHPxuI",
            authDomain: "chelan-classroom-pass-a811e.firebaseapp.com",
            databaseURL: "https://chelan-classroom-pass-a811e-default-rtdb.firebaseio.com",
            projectId: "chelan-classroom-pass-a811e",
            storageBucket: "chelan-classroom-pass-a811e.firebasestorage.app",
            messagingSenderId: "645480807479",
            appId: "1:645480807479:web:d280d4ef38e8754a9953b2"
        };

        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);

        let currentUnrecognizedId = null;
        let pendingActionType = null;

        window.handleAction = async (actionType) => {
            const idInput = document.getElementById('student-id-input');
            const studentId = idInput.value.trim();
            const status = document.getElementById('status-message');

            if (!studentId) {
                setStatus("Please scan or enter your student ID.", "text-red-600");
                return;
            }

            try {
                // Check roster
                const rosterSnap = await get(ref(db, `classroom_roster/${studentId}`));
                if (!rosterSnap.exists()) {
                    currentUnrecognizedId = studentId;
                    pendingActionType = actionType;
                    document.getElementById('new-student-modal').classList.remove('hidden');
                    return;
                }

                const student = rosterSnap.val();
                const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || studentId;

                if (actionType === 'phone') {
                    await processPhoneAction(studentId, studentName, student);
                } else if (actionType === 'bathroom') {
                    await processBathroomAction(studentId, studentName);
                } else if (actionType === 'hall') {
                    await processHallAction(studentId, studentName);
                }

                idInput.value = '';
                document.getElementById('pocket-selection').classList.add('hidden');
                document.getElementById('pocket-input').value = '';

            } catch (err) {
                console.error("Action error:", err);
                setStatus("An error occurred. Please try again.", "text-red-600");
            }
        };

        async function processPhoneAction(studentId, studentName, student) {
            const phoneSnap = await get(ref(db, `active_phones_in_class/${studentId}`));
            
            if (phoneSnap.exists()) {
                // Check Out
                await remove(ref(db, `active_phones_in_class/${studentId}`));
                await push(ref(db, 'system_logs'), {
                    studentId: studentId,
                    name: studentName,
                    type: 'Phone',
                    details: 'COS',
                    timestamp: Date.now()
                });
                setStatus(`Phone Checked Out for ${studentName}`, "text-green-700");
            } else {
                // Check In - requires pocket #
                const pocketInput = document.getElementById('pocket-input');
                const pocketVal = pocketInput.value.trim();
                const pocketElem = document.getElementById('pocket-selection');

                if (pocketElem.classList.contains('hidden')) {
                    pocketElem.classList.remove('hidden');
                    pocketInput.focus();
                    setStatus(`Enter Pocket # for ${studentName}`, "text-amber-700");
                    return;
                }

                if (!pocketVal) {
                    setStatus("Please enter a valid pocket number.", "text-red-600");
                    return;
                }

                const pocketNum = parseInt(pocketVal, 10);
                const formattedPocket = String(pocketNum).padStart(2, '0');

                await set(ref(db, `active_phones_in_class/${studentId}`), {
                    studentName: studentName,
                    firstName: student.firstName || '',
                    lastName: student.lastName || '',
                    pocket: pocketNum,
                    timestamp: Date.now()
                });

                await push(ref(db, 'system_logs'), {
                    studentId: studentId,
                    name: studentName,
                    type: 'Phone',
                    details: `CI-${formattedPocket}`,
                    timestamp: Date.now()
                });

                setStatus(`Phone Checked In (Pocket #${pocketNum}) for ${studentName}`, "text-green-700");
            }
        }

        async function processBathroomAction(studentId, studentName) {
            const passSnap = await get(ref(db, `active_bathroom_passes/${studentId}`));

            if (passSnap.exists()) {
                // Return
                await remove(ref(db, `active_bathroom_passes/${studentId}`));
                await push(ref(db, 'system_logs'), {
                    studentId: studentId,
                    name: studentName,
                    type: 'Bathroom',
                    details: 'BP-I',
                    timestamp: Date.now()
                });
                setStatus(`Bathroom Pass Returned: ${studentName}`, "text-green-700");
            } else {
                // Out
                await set(ref(db, `active_bathroom_passes/${studentId}`), {
                    studentName: studentName,
                    timestamp: Date.now()
                });
                await push(ref(db, 'system_logs'), {
                    studentId: studentId,
                    name: studentName,
                    type: 'Bathroom',
                    details: 'BP-O',
                    timestamp: Date.now()
                });
                setStatus(`Bathroom Pass Out: ${studentName}`, "text-red-600");
            }
        }

        async function processHallAction(studentId, studentName) {
            const passSnap = await get(ref(db, `active_hall_passes/${studentId}`));

            if (passSnap.exists()) {
                // Return
                await remove(ref(db, `active_hall_passes/${studentId}`));
                await push(ref(db, 'system_logs'), {
                    studentId: studentId,
                    name: studentName,
                    type: 'Hall Pass',
                    details: 'HP-I',
                    timestamp: Date.now()
                });
                setStatus(`Hall Pass Returned: ${studentName}`, "text-green-700");
            } else {
                // Out
                await set(ref(db, `active_hall_passes/${studentId}`), {
                    studentName: studentName,
                    timestamp: Date.now()
                });
                await push(ref(db, 'system_logs'), {
                    studentId: studentId,
                    name: studentName,
                    type: 'Hall Pass',
                    details: 'HP-O',
                    timestamp: Date.now()
                });
                setStatus(`Hall Pass Out: ${studentName}`, "text-indigo-600");
            }
        }

        window.submitPendingStudent = async () => {
            const fname = document.getElementById('new-first-name').value.trim();
            const lname = document.getElementById('new-last-name').value.trim();
            const pocketVal = document.getElementById('pocket-input').value.trim();

            if (!fname || !lname) {
                alert("Please enter both first and last name.");
                return;
            }

            try {
                await set(ref(db, `pending_roster_approvals/${currentUnrecognizedId}`), {
                    firstName: fname,
                    lastName: lname,
                    pocket: pocketVal ? parseInt(pocketVal, 10) : 0,
                    timestamp: Date.now()
                });

                document.getElementById('new-student-modal').classList.add('hidden');
                document.getElementById('student-id-input').value = '';
                document.getElementById('new-first-name').value = '';
                document.getElementById('new-last-name').value = '';
                
                setStatus("Approval request submitted to teacher.", "text-amber-700");
            } catch (err) {
                console.error("Pending approval error:", err);
            }
        };

        window.cancelPendingStudent = () => {
            document.getElementById('new-student-modal').classList.add('hidden');
            currentUnrecognizedId = null;
        };

        function setStatus(msg, colorClass = "text-slate-500") {
            const s = document.getElementById('status-message');
            s.className = `min-h-[2rem] text-sm font-bold ${colorClass}`;
            s.textContent = msg;
        }
    </script>
</body>
</html>
