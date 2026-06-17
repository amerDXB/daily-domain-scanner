// Default Keywords
const DEFAULT_KEYWORDS = ['squamish', 'whistler', 'pemberton', 'seatosky'];

// State
let keywords = [...DEFAULT_KEYWORDS];
let foundLeads = []; // Array of { id, domain, match }

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const keywordInput = document.getElementById('keyword-input');
const addKeywordBtn = document.getElementById('add-keyword-btn');
const keywordsList = document.getElementById('keywords-list');
const keywordCount = document.getElementById('keyword-count');
const resetKeywordsBtn = document.getElementById('reset-keywords');

const statKeywords = document.getElementById('stat-keywords');
const statScanned = document.getElementById('stat-scanned');
const statLeads = document.getElementById('stat-leads');

const processingCard = document.getElementById('processing-card');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const progressStatus = document.getElementById('progress-status');
const progressStats = document.getElementById('progress-stats');

const resultsMeta = document.getElementById('results-meta');
const resultsBody = document.getElementById('results-body');
const searchWrapper = document.getElementById('search-wrapper');
const searchInput = document.getElementById('search-input');
const exportCsvBtn = document.getElementById('export-csv');
const exportTxtBtn = document.getElementById('export-txt');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadKeywords();
    setupEventListeners();
    updateKeywordUI();
});

// Load keywords from LocalStorage or default
function loadKeywords() {
    const stored = localStorage.getItem('domain_scan_keywords');
    if (stored) {
        try {
            keywords = JSON.parse(stored);
        } catch (e) {
            keywords = [...DEFAULT_KEYWORDS];
        }
    } else {
        keywords = [...DEFAULT_KEYWORDS];
    }
}

// Save keywords
function saveKeywords() {
    localStorage.setItem('domain_scan_keywords', JSON.stringify(keywords));
    updateKeywordUI();
}

// Update Keyword Chips and Stats
function updateKeywordUI() {
    keywordsList.innerHTML = '';
    
    if (keywords.length === 0) {
        keywordsList.innerHTML = '<span class="empty-state-text" style="font-size:0.8rem;color:var(--text-muted);">No keywords. Add one above!</span>';
    }

    keywords.forEach((kw, index) => {
        const chip = document.createElement('div');
        chip.className = 'keyword-chip';
        chip.innerHTML = `
            <span>${escapeHTML(kw)}</span>
            <button onclick="removeKeyword(${index})">&times;</button>
        `;
        keywordsList.appendChild(chip);
    });

    keywordCount.textContent = `${keywords.length} active`;
    statKeywords.textContent = keywords.length;
}

// Add Keyword
function addKeyword() {
    const value = keywordInput.value.trim().toLowerCase();
    if (value && !keywords.includes(value)) {
        keywords.push(value);
        saveKeywords();
        keywordInput.value = '';
    }
}

// Remove Keyword (Exposed globally)
window.removeKeyword = function(index) {
    keywords.splice(index, 1);
    saveKeywords();
};

// Reset Keywords
resetKeywordsBtn.addEventListener('click', () => {
    keywords = [...DEFAULT_KEYWORDS];
    saveKeywords();
});

// Event Listeners
function setupEventListeners() {
    // Keyword Add triggers
    addKeywordBtn.addEventListener('click', addKeyword);
    keywordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addKeyword();
    });

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleZipFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            handleZipFile(files[0]);
        }
    });

    // Search Filter
    searchInput.addEventListener('input', () => {
        renderResultsTable(searchInput.value.trim().toLowerCase());
    });

    // Export Actions
    exportCsvBtn.addEventListener('click', exportCSV);
    exportTxtBtn.addEventListener('click', exportTXT);
}

// Handle ZIP Upload & Extraction
async function handleZipFile(file) {
    if (!file.name.endsWith('.zip')) {
        alert('Please drop a valid .zip archive.');
        return;
    }

    // Reset results & show processing
    foundLeads = [];
    statLeads.textContent = '0';
    statScanned.textContent = '--';
    resultsMeta.textContent = 'Processing...';
    
    processingCard.classList.remove('hidden');
    updateProgress(0, 'Reading ZIP file...', 'Reading contents');

    try {
        const zip = await JSZip.loadAsync(file);
        
        // Find text file in zip (usually there's one)
        let txtFileKey = Object.keys(zip.files).find(name => name.endsWith('.txt'));
        
        if (!txtFileKey) {
            throw new Error('No .txt file found inside the ZIP archive.');
        }

        updateProgress(10, 'Extracting domains list...', 'Reading text contents');
        const text = await zip.files[txtFileKey].async('string');

        // Start scanning the lines chunk-by-chunk
        scanTextData(text);

    } catch (err) {
        console.error(err);
        alert(`Failed to process zip file: ${err.message}`);
        processingCard.classList.add('hidden');
        resultsMeta.textContent = 'Error processing file.';
    }
}

// Scan large text payload in chunk ticks to keep UI smooth
function scanTextData(text) {
    updateProgress(20, 'Preparing scanner...', 'Splitting file content');
    
    // Split by lines
    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;
    statScanned.textContent = totalLines.toLocaleString();
    
    let currentIndex = 0;
    const chunkSize = 25000; // Processes 25k lines per event loop tick

    updateProgress(25, 'Scanning domains...', `0 / ${totalLines.toLocaleString()} lines`);

    function processChunk() {
        const end = Math.min(currentIndex + chunkSize, totalLines);
        
        for (let i = currentIndex; i < end; i++) {
            const line = lines[i];
            
            // Clean up domain
            const domain = line.split(',')[0].trim().toLowerCase();
            
            // Skip empty, comments, headers
            if (!domain || domain.startsWith('#') || domain.startsWith('domain')) {
                continue;
            }

            // Keyword Match Check
            for (let j = 0; j < keywords.length; j++) {
                const kw = keywords[j];
                const isMatch = kw.startsWith('.') ? domain.endsWith(kw) : domain.includes(kw);
                if (isMatch) {
                    foundLeads.push({
                        id: foundLeads.length + 1,
                        domain: domain,
                        match: kw
                    });
                    break; // Move to next domain once matched
                }
            }
        }

        currentIndex = end;
        statLeads.textContent = foundLeads.length;

        const percent = Math.floor((currentIndex / totalLines) * 100);
        updateProgress(
            percent,
            'Scanning domains...',
            `Processed ${currentIndex.toLocaleString()} of ${totalLines.toLocaleString()} domains`
        );

        if (currentIndex < totalLines) {
            // Queue next chunk on next tick
            setTimeout(processChunk, 0);
        } else {
            // Scan Complete
            finishScanning(totalLines);
        }
    }

    // Start processing loop
    setTimeout(processChunk, 0);
}

// Update loading status card
function updateProgress(percent, statusText, statsText) {
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressStatus.textContent = statusText;
    progressStats.textContent = statsText;
}

// Handle scanner finish
function finishScanning(totalLines) {
    processingCard.classList.add('hidden');
    resultsMeta.textContent = `Completed scan of ${totalLines.toLocaleString()} domains. Found ${foundLeads.length} leads.`;

    if (foundLeads.length > 0) {
        exportCsvBtn.classList.remove('hidden');
        exportTxtBtn.classList.remove('hidden');
        exportCsvBtn.disabled = false;
        exportTxtBtn.disabled = false;
        searchWrapper.classList.remove('hidden');
    } else {
        exportCsvBtn.classList.add('hidden');
        exportTxtBtn.classList.add('hidden');
        searchWrapper.classList.add('hidden');
    }

    renderResultsTable();
}

// Render Results to HTML Table
function renderResultsTable(filter = '') {
    resultsBody.innerHTML = '';
    
    const filtered = foundLeads.filter(lead => 
        lead.domain.includes(filter) || lead.match.includes(filter)
    );

    if (filtered.length === 0) {
        resultsBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    <div class="empty-state-content">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p>${foundLeads.length > 0 ? 'No leads match your filter query.' : 'Zero local leads found matching your active keywords.'}</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach((lead, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td class="domain-cell">${escapeHTML(lead.domain)}</td>
            <td><span class="keyword-badge">${escapeHTML(lead.match)}</span></td>
            <td>
                <a href="https://${escapeHTML(lead.domain)}" target="_blank" rel="noopener" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">
                    Visit Site
                </a>
            </td>
        `;
        resultsBody.appendChild(tr);
    });
}

// Download helpers
function exportCSV() {
    if (foundLeads.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Domain,Matched Keyword\r\n";
    
    foundLeads.forEach(lead => {
        csvContent += `${lead.domain},${lead.match}\r\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `local_leads_${formatDate(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportTXT() {
    if (foundLeads.length === 0) return;
    
    let txtContent = "";
    foundLeads.forEach(lead => {
        txtContent += `${lead.domain}\r\n`;
    });
    
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(txtContent));
    element.setAttribute('download', `local_leads_${formatDate(new Date())}.txt`);
    
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// Utility functions
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}
