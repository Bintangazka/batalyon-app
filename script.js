const SUPABASE_URL = 'https://vsepnqlydyioaslyyeeq.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_wEKYfrWr55A9bLT0HsEL-A_vP6dE_ef'; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// USER & PASSWORD REGISTRY
let userCredentials = {
  "PIKET BATALYON": "admin123",
  "KORSIS": "admin123",
  "DEVELOPER 1": "admin123",
  "DEVELOPER 2": "admin123",
  "DEVELOPER 3": "admin123",
  "DEVELOPER 4": "admin123",
  "DEVELOPER 5": "admin123"
};

['A','B','C','D','E','F','G'].forEach(ki => {
  userCredentials[`PJ KI ${ki}`] = "admin123";
  for(let t=1; t<=4; t++) {
    userCredentials[`PJ TON ${t} KI ${ki}`] = "admin123";
    userCredentials[`PJ TON ${t}`] = "admin123"; 
  }
});

const kompiConfig = [
  { id: 'A', name: 'KOMPI A', tons: 4 },
  { id: 'B', name: 'KOMPI B', tons: 4 },
  { id: 'C', name: 'KOMPI C', tons: 4 },
  { id: 'D', name: 'KOMPI D', tons: 4 },
  { id: 'E', name: 'KOMPI E', tons: 4 },
  { id: 'F', name: 'KOMPI F', tons: 4 },
  { id: 'G', name: 'KOMPI G', tons: 3 }
];

const statusOptions = ['H', 'S', 'DL', 'DD', 'TK'];
let batalyonData = {};
let currentUserRole = "";
let selectedAbsensiCategory = 'S';
let notifConfig = null;

function initData() {
  kompiConfig.forEach(k => {
    batalyonData[k.id] = { name: k.name, tons: {} };

    for(let t = 1; t <= k.tons; t++) {
      let prajuritList = [];
      let maxPersonel = (k.id === 'B' && (t === 3 || t === 4)) ? 40 : 25;

      for(let p = 1; p <= maxPersonel; p++) {
        prajuritList.push({
          id: `${k.id}-${t}-${p}`,
          nama: `PK ${k.id}${t} Personel ${p}`,
          status: 'H',
          posisi: '',
          ketDetail: ''
        });
      }

      batalyonData[k.id].tons[t] = {
        namaTon: `TON ${t}`,
        prajurit: prajuritList
      };
    }
  });
}

async function fetchSupabaseData() {
  try {
    const { data, error } = await supabaseClient.from('DATA').select('*');
    if (error) throw error;

    updateKoneksiStatus(true);

    if (data && data.length > 0) {
      data.forEach(row => {
        const kId = row.kompi_id;
        const tId = row.ton_id;
        if (batalyonData[kId] && batalyonData[kId].tons[tId]) {
          const list = batalyonData[kId].tons[tId].prajurit;
          const idx = list.findIndex(p => p.id === row.id);
          if (idx !== -1) {
            list[idx].status = row.status || 'H';
            if (row.nama) list[idx].nama = row.nama;
            list[idx].posisi = row.posisi || '';
            list[idx].ketDetail = row.ketDetail || '';
          }
        }
      });
      renderDashboard();
      populateAbsensiPersonelDropdown();
    }
  } catch (err) {
    updateKoneksiStatus(false);
  }
}

function updateKoneksiStatus(isConnected) {
  const badge = document.getElementById('statusKoneksiBadge');
  const dot = document.getElementById('statusKoneksiDot');
  const text = document.getElementById('statusKoneksiText');

  if (isConnected) {
    badge.className = "bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-200 flex items-center gap-2";
    dot.className = "w-2 h-2 rounded-full bg-emerald-600 animate-pulse";
    text.innerText = "Status: Terhubung";
  } else {
    badge.className = "bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 flex items-center gap-2";
    dot.className = "w-2 h-2 rounded-full bg-red-600";
    text.innerText = "Status: Tidak Terhubung";
  }
}

function checkUserCanEdit(kompiId, tonId) {
  if (currentUserRole.startsWith('DEVELOPER') || currentUserRole === 'PIKET BATALYON' || currentUserRole === 'KORSIS') {
    return true;
  }
  if (currentUserRole.startsWith('PJ KI')) {
    const targetKi = currentUserRole.replace('PJ KI ', '').trim();
    return targetKi === kompiId;
  }
  if (currentUserRole.startsWith('PJ TON')) {
    let regex = /PJ TON (\d+)/;
    let match = currentUserRole.match(regex);
    if (match) {
      let allowedTon = match[1];
      if (currentUserRole.includes('KI ')) {
        let kiMatch = currentUserRole.match(/KI ([A-G])/);
        if (kiMatch) {
          return (kiMatch[1] === kompiId && parseInt(allowedTon) === parseInt(tonId));
        }
      }
      return parseInt(allowedTon) === parseInt(tonId);
    }
  }
  return false;
}

async function toggleStatus(kompiId, tonId, pIndex) {
  if (!checkUserCanEdit(kompiId, tonId)) {
    showToast("Akses Ditolak", `Anda tidak berwenang mengubah data Kompi ${kompiId} Ton ${tonId}.`);
    return;
  }

  const target = batalyonData[kompiId].tons[tonId].prajurit[pIndex];
  const nextIdx = (statusOptions.indexOf(target.status) + 1) % statusOptions.length;
  const newStatus = statusOptions[nextIdx];

  target.status = newStatus;
  renderPersonelList();
  renderDashboard();
  populateAbsensiPersonelDropdown();

  const { error } = await supabaseClient
    .from('DATA')
    .upsert({ 
      id: target.id,
      kompi_id: kompiId,
      ton_id: parseInt(tonId),
      nama: target.nama,
      status: newStatus,
      posisi: target.posisi,
      ketDetail: target.ketDetail
    });

  if (error) updateKoneksiStatus(false);
  else updateKoneksiStatus(true);
}

function initSupabaseRealtime() {
  supabaseClient
    .channel('public:DATA')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'DATA' }, payload => {
      const updated = payload.new;
      if (!updated) return;

      const kId = updated.kompi_id;
      const tId = updated.ton_id;

      if (batalyonData[kId] && batalyonData[kId].tons[tId]) {
        const list = batalyonData[kId].tons[tId].prajurit;
        const index = list.findIndex(p => p.id === updated.id);
        if (index !== -1) {
          list[index].status = updated.status;
          if (updated.nama) list[index].nama = updated.nama;
          list[index].posisi = updated.posisi || '';
          list[index].ketDetail = updated.ketDetail || '';
        }
      }

      renderDashboard();
      populateAbsensiPersonelDropdown();
      if (currentKompi === kId && currentTon == tId) {
        renderPersonelList();
      }
    })
    .subscribe();
}

function showToast(title, msg) {
  document.getElementById('toastTitle').innerText = title;
  document.getElementById('toastMessage').innerText = msg;
  const toast = document.getElementById('customToast');
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

function closeToast() {
  document.getElementById('customToast').classList.add('hidden');
}

function salinLaporanTelegram() {
  const hariList = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulanList = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  const now = new Date();
  const namaHari = hariList[now.getDay()];
  const tanggal = now.getDate();
  const namaBulan = bulanList[now.getMonth()];
  const tahun = now.getFullYear();

  const tanggalFormatted = `${namaHari}, ${tanggal} ${namaBulan} ${tahun}`;

  let totalBatalyon = 705;
  let kurangBatalyon = 0;
  let globalSakit = [];
  let globalDL = [];
  let globalDD = [];
  let detailPerKompiText = "";

  kompiConfig.forEach(k => {
    let kompiTotal = 0;
    let kompiKurang = 0;
    let kompiSakit = [];
    let kompiDL = [];
    let kompiDD = [];
    let kompiTK = [];

    Object.keys(batalyonData[k.id].tons).forEach(tId => {
      const ton = batalyonData[k.id].tons[tId];
      kompiTotal += ton.prajurit.length;

      ton.prajurit.forEach(p => {
        if (p.status !== 'H') {
          kompiKurang++;
          kurangBatalyon++;
          
          let rincianText = p.nama;
          if (p.ketDetail) rincianText += ` ${p.ketDetail}`;
          if (p.posisi) rincianText += ` posisi ${p.posisi}`;

          if (p.status === 'S') { kompiSakit.push(rincianText); globalSakit.push(rincianText); }
          if (p.status === 'DL') { kompiDL.push(rincianText); globalDL.push(rincianText); }
          if (p.status === 'DD') { kompiDD.push(rincianText); globalDD.push(rincianText); }
          if (p.status === 'TK') { kompiTK.push(rincianText); }
        }
      });
    });

    let kompiHadir = kompiTotal - kompiKurang;

    let ketSection = "";
    if (kompiSakit.length > 0) {
      ketSection += `${kompiSakit.length} sakit\n` + kompiSakit.map((s, idx) => `${idx + 1}. ${s}`).join('\n') + '\n';
    }
    if (kompiDL.length > 0) {
      ketSection += `${kompiDL.length} DL\n` + kompiDL.map((s, idx) => `${idx + 1}. ${s}`).join('\n') + '\n';
    }
    if (kompiDD.length > 0) {
      ketSection += `${kompiDD.length} DD\n` + kompiDD.map((s, idx) => `${idx + 1}. ${s}`).join('\n') + '\n';
    }
    if (kompiTK.length > 0) {
      ketSection += `${kompiTK.length} TK\n` + kompiTK.map((s, idx) => `${idx + 1}. ${s}`).join('\n') + '\n';
    }

    detailPerKompiText += `
KOMPI ${k.id}
Jumlah : ${kompiTotal}
Kurang : ${kompiKurang}
Hadir : ${kompiHadir}
Keterangan :
${ketSection ? ketSection.trim() : 'Lengkap'}
`;
  });

  let hadirBatalyon = totalBatalyon - kurangBatalyon;

  let globalKeteranganText = "";
  if (globalSakit.length > 0) {
    globalKeteranganText += `${globalSakit.length} SAKIT\n` + globalSakit.map((s, idx) => `${idx + 1}. ${s}`).join('\n') + '\n\n';
  }
  if (globalDL.length > 0) {
    globalKeteranganText += `${globalDL.length} DL\n` + globalDL.map((s, idx) => `${idx + 1}. ${s}`).join('\n') + '\n\n';
  }
  if (globalDD.length > 0) {
    globalKeteranganText += `${globalDD.length} DD\n` + globalDD.map((s, idx) => `${idx + 1}. ${s}`).join('\n') + '\n\n';
  }

  const templateText = `Selamat Siang, mohon izin sersan mayor dua kadet  ,izin mengirimkan data Prajurit Kadet pada hari ${tanggalFormatted}.Jumlah: ${totalBatalyon} + 22 Palestine

Kurang: ${kurangBatalyon}
Hadir: ${hadirBatalyon} + 22 Palestine

Keterangan:

${globalKeteranganText}${detailPerKompiText}`;

  navigator.clipboard.writeText(templateText).then(() => {
    showToast("Format Disalin", "Format Laporan Telegram Berhasil Disalin! Tinggal Paste di Telegram.");
  });
}

function selectCategoryAbsensi(cat) {
  selectedAbsensiCategory = cat;
  const bSakit = document.getElementById('btnCatatSakit');
  const bDD = document.getElementById('btnCatatDD');
  const bDL = document.getElementById('btnCatatDL');

  bSakit.className = "flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition " + (cat === 'S' ? "border-amber-500 bg-amber-50 text-amber-800" : "border-amber-200 text-amber-700 hover:bg-amber-50");
  bDD.className = "flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition " + (cat === 'DD' ? "border-purple-500 bg-purple-50 text-purple-800" : "border-purple-200 text-purple-700 hover:bg-purple-50");
  bDL.className = "flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition " + (cat === 'DL' ? "border-blue-500 bg-blue-50 text-blue-800" : "border-blue-200 text-blue-700 hover:bg-blue-50");
}

function populateAbsensiPersonelDropdown() {
  const select = document.getElementById('absensiPersonelSelect');
  select.innerHTML = '<option value="">-- Pilih Nama Personel --</option>';

  let count = 0;
  kompiConfig.forEach(k => {
    Object.keys(batalyonData[k.id].tons).forEach(tId => {
      batalyonData[k.id].tons[tId].prajurit.forEach(p => {
        if (p.status !== 'H') {
          count++;
          select.innerHTML += `<option value="${p.id}">[${p.status}] KOMPI ${k.id} - TON ${tId} | ${p.nama}</option>`;
        }
      });
    });
  });

  if (count === 0) {
    select.innerHTML = '<option value="">-- Semua Personel Hadir Lengkap --</option>';
  }
}

async function saveRincianAbsensi(e) {
  e.preventDefault();
  const pId = document.getElementById('absensiPersonelSelect').value;
  const posisi = document.getElementById('absensiPosisiInput').value.trim();
  const ket = document.getElementById('absensiKeteranganInput').value.trim();

  if (!pId) return showToast("Peringatan", "Pilih personel terlebih dahulu!");

  const parts = pId.split('-');
  const kId = parts[0];
  const tId = parts[1];

  if (!checkUserCanEdit(kId, tId)) {
    showToast("Akses Ditolak", `Anda tidak berwenang mengisi data Kompi ${kId} Ton ${tId}.`);
    return;
  }

  const list = batalyonData[kId].tons[tId].prajurit;
  const target = list.find(p => p.id === pId);

  if (target) {
    target.status = selectedAbsensiCategory;
    target.posisi = posisi;
    target.ketDetail = ket;

    renderDashboard();
    showToast("Rincian Disimpan", `Berhasil mencatat rincian absensi untuk ${target.nama}`);

    document.getElementById('absensiPosisiInput').value = '';
    document.getElementById('absensiKeteranganInput').value = '';

    await supabaseClient.from('DATA').upsert({
      id: target.id,
      kompi_id: kId,
      ton_id: parseInt(tId),
      nama: target.nama,
      status: target.status,
      posisi: target.posisi,
      ketDetail: target.ketDetail
    });
  }
}

function handleLogin(e) {
  e.preventDefault();
  const userInput = document.getElementById('usernameInput').value.trim().toUpperCase();
  const passInput = document.getElementById('passwordInput').value.trim();
  const errorEl = document.getElementById('loginError');

  const registeredPass = userCredentials[userInput];

  if (registeredPass && registeredPass === passInput) {
    currentUserRole = userInput;
    errorEl.classList.add('hidden');
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    document.getElementById('userNameDisplay').innerText = userInput;
    document.getElementById('userRoleBadge').innerText = userInput;
    document.getElementById('userAvatar').innerText = userInput.charAt(0);
    
    if (userInput.startsWith('DEVELOPER')) {
      document.getElementById('developerToolsSection').classList.remove('hidden');
      populateUserPasswordDropdown();
    } else {
      document.getElementById('developerToolsSection').classList.add('hidden');
    }

    renderDashboard();
    populateAbsensiPersonelDropdown();
    renderPrajuritTable();
    fetchSupabaseData();
    initSupabaseRealtime();
    checkAndShowNotification();
    lucide.createIcons();
  } else {
    errorEl.classList.remove('hidden');
  }
}

function logout() {
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('passwordInput').value = '';
  document.getElementById('usernameInput').value = '';
}

let currentKompi = null;
let currentTon = null;

function switchTab(tabName) {
  const views = ['dashboard', 'kompi', 'prajurit', 'absensi', 'pengaturan'];
  views.forEach(v => {
    document.getElementById(`view-${v}`).classList.add('hidden');
    const navBtn = document.getElementById(`nav-${v}`);
    if (navBtn) {
      navBtn.classList.remove('bg-dark-active', 'text-white');
      navBtn.classList.add('text-sidebar');
    }
  });

  document.getElementById(`view-${tabName}`).classList.remove('hidden');
  const activeNav = document.getElementById(`nav-${tabName}`);
  if (activeNav) {
    activeNav.classList.add('bg-dark-active', 'text-white');
    activeNav.classList.remove('text-sidebar');
  }

  if (tabName === 'kompi') renderKompiList();
  if (tabName === 'prajurit') renderPrajuritTable();
  if (tabName === 'dashboard') renderDashboard();
  if (tabName === 'absensi') populateAbsensiPersonelDropdown();
}

function renderDashboard() {
  const grid = document.getElementById('dashboardKompiGrid');
  grid.innerHTML = '';

  let grandHadir = 0;
  let grandKurang = 0;

  kompiConfig.forEach(k => {
    let totalKompiPrajurit = 0;
    let totalKompiKurang = 0;
    let ketSummary = [];

    Object.keys(batalyonData[k.id].tons).forEach(tId => {
      const ton = batalyonData[k.id].tons[tId];
      totalKompiPrajurit += ton.prajurit.length;

      ton.prajurit.forEach(p => {
        if (p.status !== 'H') {
          totalKompiKurang++;
          let txt = `${p.nama} (${p.status})`;
          if (p.posisi) txt += ` [${p.posisi}]`;
          ketSummary.push(txt);
        }
      });
    });

    const totalKompiHadir = totalKompiPrajurit - totalKompiKurang;
    grandHadir += totalKompiHadir;
    grandKurang += totalKompiKurang;

    const card = document.createElement('div');
    card.className = "bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition";
    card.innerHTML = `
      <div class="flex justify-between items-center border-b pb-3 mb-3">
        <h3 class="font-bold text-gray-800 text-base">${k.name}</h3>
        <span class="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-semibold">${k.tons} Peleton</span>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center mb-4">
        <div class="bg-gray-50 p-2 rounded-lg">
          <p class="text-[10px] text-gray-500 uppercase font-medium">Jumlah</p>
          <p class="text-lg font-bold text-gray-800">${totalKompiPrajurit}</p>
        </div>
        <div class="bg-red-50 p-2 rounded-lg">
          <p class="text-[10px] text-red-500 uppercase font-medium">Kurang</p>
          <p class="text-lg font-bold text-red-600">${totalKompiKurang}</p>
        </div>
        <div class="bg-green-50 p-2 rounded-lg">
          <p class="text-[10px] text-green-500 uppercase font-medium">Hadir</p>
          <p class="text-lg font-bold text-green-600">${totalKompiHadir}</p>
        </div>
      </div>

      <div>
        <p class="text-xs font-semibold text-gray-700 mb-1">Catatan Keterangan:</p>
        ${ketSummary.length > 0 
          ? `<ul class="text-xs text-gray-600 space-y-1 list-disc pl-4">${ketSummary.map(item => `<li>${item}</li>`).join('')}</ul>`
          : `<p class="text-xs text-emerald-600 font-semibold italic">Lengkap</p>`
        }
      </div>
    `;
    grid.appendChild(card);
  });

  document.getElementById('totalHadir').innerText = grandHadir;
  document.getElementById('totalKurang').innerText = grandKurang;
}

function renderKompiList() {
  document.getElementById('kompiGrid').classList.remove('hidden');
  document.getElementById('peletonSection').classList.add('hidden');
  document.getElementById('personelSection').classList.add('hidden');

  const grid = document.getElementById('kompiGrid');
  grid.innerHTML = '';

  kompiConfig.forEach(k => {
    let totalKompiPrajurit = 0;
    Object.keys(batalyonData[k.id].tons).forEach(tId => {
      totalKompiPrajurit += batalyonData[k.id].tons[tId].prajurit.length;
    });

    const box = document.createElement('div');
    box.className = "bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:border-blue-500 cursor-pointer transition flex flex-col justify-between group";
    box.onclick = () => selectKompi(k.id);
    box.innerHTML = `
      <div>
        <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold text-lg mb-4 group-hover:bg-blue-600 group-hover:text-white transition">
          ${k.id}
        </div>
        <h3 class="text-lg font-bold text-gray-800">${k.name}</h3>
        <p class="text-xs text-gray-500 mt-1">${k.tons} Peleton (${totalKompiPrajurit} Prajurit)</p>
      </div>
      <div class="mt-6 flex items-center text-xs font-semibold text-blue-600 gap-1">
        <span>Buka Peleton</span>
        <i data-lucide="arrow-right" class="w-4 h-4"></i>
      </div>
    `;
    grid.appendChild(box);
  });
  lucide.createIcons();
}

function selectKompi(kompiId) {
  currentKompi = kompiId;
  document.getElementById('kompiGrid').classList.add('hidden');
  document.getElementById('peletonSection').classList.remove('hidden');
  document.getElementById('personelSection').classList.add('hidden');

  document.getElementById('selectedKompiTitle').innerText = `KOMPI ${kompiId}`;

  const grid = document.getElementById('peletonGrid');
  grid.innerHTML = '';

  const tons = batalyonData[kompiId].tons;
  Object.keys(tons).forEach(tId => {
    const ton = tons[tId];
    let totalPrajuritTon = ton.prajurit.length;
    let kurangCount = ton.prajurit.filter(p => p.status !== 'H').length;

    const box = document.createElement('div');
    box.className = "bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:border-blue-500 cursor-pointer transition";
    box.onclick = () => selectPeleton(kompiId, tId);
    box.innerHTML = `
      <div class="flex justify-between items-center mb-3">
        <span class="font-bold text-gray-800">${ton.namaTon}</span>
        <span class="text-xs bg-gray-100 px-2 py-0.5 rounded font-semibold text-gray-600">${totalPrajuritTon} Personel</span>
      </div>
      <p class="text-xs text-gray-500">Kurang: <span class="font-bold text-red-600">${kurangCount}</span></p>
      <p class="text-xs text-gray-500">Hadir: <span class="font-bold text-green-600">${totalPrajuritTon - kurangCount}</span></p>
    `;
    grid.appendChild(box);
  });
}

function backToKompiList() { renderKompiList(); }

function selectPeleton(kompiId, tonId) {
  currentTon = tonId;
  document.getElementById('peletonSection').classList.add('hidden');
  document.getElementById('personelSection').classList.remove('hidden');

  document.getElementById('selectedPeletonTitle').innerText = `KOMPI ${kompiId} - TON ${tonId}`;
  renderPersonelList();
}

function backToPeletonList() { selectKompi(currentKompi); }

function renderPersonelList() {
  const listContainer = document.getElementById('personelList');
  listContainer.innerHTML = '';

  const prajurit = batalyonData[currentKompi].tons[currentTon].prajurit;

  prajurit.forEach((p, idx) => {
    const item = document.createElement('div');
    let badgeClass = "bg-green-100 text-green-800 border-green-300 hover:bg-green-200";
    if (p.status === 'S') badgeClass = "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200";
    if (p.status === 'DL') badgeClass = "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200";
    if (p.status === 'DD') badgeClass = "bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200";
    if (p.status === 'TK') badgeClass = "bg-red-100 text-red-800 border-red-300 hover:bg-red-200";

    item.className = `p-3 rounded-xl border bg-white flex items-center justify-between shadow-sm`;
    item.innerHTML = `
      <span class="text-xs font-semibold text-gray-800">${idx + 1}. ${p.nama}</span>
      <button onclick="toggleStatus('${currentKompi}', '${currentTon}', ${idx})" 
              title="Klik untuk ubah status" 
              class="px-3 py-1 rounded-lg border text-xs font-bold transition shadow-sm ${badgeClass}">
        ${p.status}
      </button>
    `;
    listContainer.appendChild(item);
  });
}

function renderPrajuritTable() {
  const tbody = document.getElementById('prajuritTableBody');
  tbody.innerHTML = '';
  let no = 1;

  kompiConfig.forEach(k => {
    Object.keys(batalyonData[k.id].tons).forEach(tId => {
      batalyonData[k.id].tons[tId].prajurit.forEach((p, pIndex) => {
        tbody.innerHTML += `
          <tr class="hover:bg-gray-50 border-b">
            <td class="py-3 px-4 text-xs font-semibold text-gray-500">${no++}</td>
            <td class="py-3 px-4 text-xs font-bold text-gray-700">KOMPI ${k.id}</td>
            <td class="py-3 px-4 text-xs font-medium text-gray-600">TON ${tId}</td>
            <td class="py-3 px-4 font-semibold text-sm text-gray-800">${p.nama}</td>
            <td class="py-3 px-4 text-center">
              <button onclick="editNamaPrajurit('${k.id}', '${tId}', ${pIndex})" class="px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md text-xs font-semibold transition flex items-center gap-1 mx-auto">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit Nama
              </button>
            </td>
          </tr>
        `;
      });
    });
  });
  lucide.createIcons();
}

async function editNamaPrajurit(kId, tId, pIndex) {
  if (!checkUserCanEdit(kId, tId)) {
    showToast("Akses Ditolak", `Anda tidak berwenang mengedit nama prajurit di Kompi ${kId} Ton ${tId}.`);
    return;
  }

  const currentNama = batalyonData[kId].tons[tId].prajurit[pIndex].nama;
  const newNama = prompt("Masukkan nama lengkap prajurit baru:", currentNama);

  if (newNama !== null && newNama.trim() !== "") {
    batalyonData[kId].tons[tId].prajurit[pIndex].nama = newNama.trim();
    renderPrajuritTable();
    populateAbsensiPersonelDropdown();
    
    await supabaseClient.from('DATA').upsert({
      id: batalyonData[kId].tons[tId].prajurit[pIndex].id,
      kompi_id: kId,
      ton_id: parseInt(tId),
      nama: newNama.trim(),
      status: batalyonData[kId].tons[tId].prajurit[pIndex].status,
      posisi: batalyonData[kId].tons[tId].prajurit[pIndex].posisi,
      ketDetail: batalyonData[kId].tons[tId].prajurit[pIndex].ketDetail
    });
  }
}

function filterPrajuritTable() {
  const input = document.getElementById('searchPrajuritInput').value.toLowerCase();
  const rows = document.querySelectorAll('#prajuritTableBody tr');
  rows.forEach(row => {
    row.style.display = row.innerText.toLowerCase().includes(input) ? '' : 'none';
  });
}

function toggleDarkMode() {
  const isDark = document.getElementById('darkModeToggle').checked;
  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

function saveNotificationConfig(e) {
  e.preventDefault();
  notifConfig = {
    msg: document.getElementById('notifMsgInput').value.trim(),
    time: document.getElementById('notifTimeInput').value,
    target: document.getElementById('notifTargetInput').value
  };
  showToast("Notifikasi Disimpan", "Konfigurasi Notifikasi Berhasil Disimpan!");
  checkAndShowNotification();
}

function checkAndShowNotification() {
  if (!notifConfig) return;

  let targetMatch = false;
  if (notifConfig.target === 'ALL') targetMatch = true;
  else if (notifConfig.target === 'KORSIS' && (currentUserRole === 'KORSIS' || currentUserRole === 'PIKET BATALYON')) targetMatch = true;
  else if (notifConfig.target === 'PJ_KI' && currentUserRole.startsWith('PJ KI')) targetMatch = true;
  else if (notifConfig.target === 'PJ_TON' && currentUserRole.startsWith('PJ TON')) targetMatch = true;

  if (targetMatch) {
    document.getElementById('notifBannerMsg').innerText = notifConfig.msg;
    document.getElementById('notifBannerTime').innerText = `Dijadwalkan jam: ${notifConfig.time} WIB`;
    document.getElementById('notificationBanner').classList.remove('hidden');
  }
}

function closeNotifBanner() {
  document.getElementById('notificationBanner').classList.add('hidden');
}

function populateUserPasswordDropdown() {
  const select = document.getElementById('pwdUserSelect');
  select.innerHTML = '';
  Object.keys(userCredentials).forEach(usr => {
    if (currentUserRole !== 'DEVELOPER 1' && usr === 'DEVELOPER 1') {
      return;
    }
    select.innerHTML += `<option value="${usr}">${usr}</option>`;
  });
}

function saveUserPassword(e) {
  e.preventDefault();
  const targetUser = document.getElementById('pwdUserSelect').value;
  const newPwd = document.getElementById('pwdNewInput').value.trim();

  if (currentUserRole !== 'DEVELOPER 1' && targetUser === 'DEVELOPER 1') {
    showToast("Akses Ditolak", "Anda tidak berwenang mengedit password DEVELOPER 1!");
    return;
  }

  if (targetUser && newPwd) {
    userCredentials[targetUser] = newPwd;
    showToast("Password Diperbarui", `Password untuk ${targetUser} berhasil diubah.`);
    document.getElementById('pwdNewInput').value = '';
  }
}

initData();