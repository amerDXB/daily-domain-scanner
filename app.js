// Default Keywords
const DEFAULT_KEYWORDS = ['squamish', 'whistler', 'pemberton', 'seatosky'];

// State
let keywords = [...DEFAULT_KEYWORDS];
let foundLeads = []; // Array of { id, domain, match }
let crmDatabase = {}; // Maps domain -> { status, score, notes, email, contactPage, socials: {}, auditResult, whyMatched }

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

// Drawer Elements
const detailsDrawer = document.getElementById('details-drawer');
const closeDrawerBtn = document.getElementById('close-drawer-btn');
const saveDrawerBtn = document.getElementById('save-drawer-btn');
const drawerDomain = document.getElementById('drawer-domain');
const drawerMatchBadge = document.getElementById('drawer-match-badge');
const drawerCountryBadge = document.getElementById('drawer-country-badge');
const drawerScoreVal = document.getElementById('drawer-score-val');
const drawerStatusSelect = document.getElementById('drawer-status-select');
const drawerAuditBtn = document.getElementById('drawer-audit-btn');
const drawerInsights = document.getElementById('drawer-insights');
const drawerEmail = document.getElementById('drawer-contact-email');
const drawerPage = document.getElementById('drawer-contact-page');
const drawerInstagram = document.getElementById('drawer-contact-instagram');
const drawerFacebook = document.getElementById('drawer-contact-facebook');
const drawerLinkedIn = document.getElementById('drawer-contact-linkedin');
const drawerTwitter = document.getElementById('drawer-contact-twitter');
const drawerNotes = document.getElementById('drawer-notes');

let activeDrawerDomain = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadKeywords();
    loadCrmDatabase();
    setupEventListeners();
    updateKeywordUI();
});

// Load keywords from LocalStorage
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

// Load CRM Database from LocalStorage
function loadCrmDatabase() {
    const stored = localStorage.getItem('domain_scan_crm');
    if (stored) {
        try {
            crmDatabase = JSON.parse(stored);
        } catch (e) {
            crmDatabase = {};
        }
    } else {
        crmDatabase = {};
    }
}

// Save CRM Database
function saveCrmDatabase() {
    localStorage.setItem('domain_scan_crm', JSON.stringify(crmDatabase));
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

    // Drawer buttons
    closeDrawerBtn.addEventListener('click', closeDrawer);
    saveDrawerBtn.addEventListener('click', saveDrawerData);
    drawerAuditBtn.addEventListener('click', runAuditOnActiveDomain);

    // Close drawer on overlay click
    detailsDrawer.addEventListener('click', (e) => {
        if (e.target === detailsDrawer) {
            closeDrawer();
        }
    });
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
    
    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;
    statScanned.textContent = totalLines.toLocaleString();
    
    let currentIndex = 0;
    const chunkSize = 25000;

    updateProgress(25, 'Scanning domains...', `0 / ${totalLines.toLocaleString()} lines`);

    function processChunk() {
        const end = Math.min(currentIndex + chunkSize, totalLines);
        
        for (let i = currentIndex; i < end; i++) {
            const line = lines[i];
            const domain = line.split(',')[0].trim().toLowerCase();
            
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
                    
                    // Initialize CRM entity if it doesn't exist
                    if (!crmDatabase[domain]) {
                        crmDatabase[domain] = {
                            status: 'New',
                            score: null,
                            notes: '',
                            email: '',
                            contactPage: '',
                            socials: {
                                facebook: '',
                                instagram: '',
                                linkedin: '',
                                twitter: ''
                            },
                            whyMatched: `Keyword: ${kw}`,
                            country: null,
                            auditResult: null
                        };
                    }
                    break; 
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
            setTimeout(processChunk, 0);
        } else {
            saveCrmDatabase();
            finishScanning(totalLines);
        }
    }

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

// Render CRM Leads Results Table
function renderResultsTable(filter = '') {
    resultsBody.innerHTML = '';
    
    const filtered = foundLeads.filter(lead => 
        lead.domain.includes(filter) || lead.match.includes(filter)
    );

    if (filtered.length === 0) {
        resultsBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
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
        const domain = lead.domain;
        const crmInfo = crmDatabase[domain] || { status: 'New', score: null, whyMatched: `Keyword: ${lead.match}` };
        
        // Prepare score badge
        let scoreBadge = `<span class="score-badge">--</span>`;
        if (crmInfo.score !== null) {
            const scoreClass = crmInfo.score > 60 ? 'high' : (crmInfo.score > 30 ? 'medium' : 'low');
            scoreBadge = `<span class="score-badge ${scoreClass}">${crmInfo.score}/100</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td class="domain-cell">${escapeHTML(domain)}</td>
            <td><span class="keyword-badge" style="font-size:0.75rem;">${escapeHTML(crmInfo.whyMatched || 'Keyword: ' + lead.match)}</span></td>
            <td>${scoreBadge}</td>
            <td>
                <select onchange="updateLeadStatus('${escapeHTML(domain)}', this.value)">
                    <option value="New" ${crmInfo.status === 'New' ? 'selected' : ''}>New</option>
                    <option value="Researching" ${crmInfo.status === 'Researching' ? 'selected' : ''}>Researching</option>
                    <option value="Emailed" ${crmInfo.status === 'Emailed' ? 'selected' : ''}>Emailed</option>
                    <option value="Followed Up" ${crmInfo.status === 'Followed Up' ? 'selected' : ''}>Followed Up</option>
                    <option value="Interested" ${crmInfo.status === 'Interested' ? 'selected' : ''}>Interested</option>
                    <option value="Closed" ${crmInfo.status === 'Closed' ? 'selected' : ''}>Closed</option>
                    <option value="Ignore" ${crmInfo.status === 'Ignore' ? 'selected' : ''}>Ignore</option>
                </select>
            </td>
            <td>
                <button onclick="openDetailsDrawer('${escapeHTML(domain)}', '${escapeHTML(lead.match)}')" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">
                    Details
                </button>
            </td>
        `;
        resultsBody.appendChild(tr);
    });
}

// Inline Status Change handler (Exposed globally)
window.updateLeadStatus = function(domain, status) {
    if (crmDatabase[domain]) {
        crmDatabase[domain].status = status;
        saveCrmDatabase();
        // If drawer is currently open for this domain, update its selector too
        if (activeDrawerDomain === domain) {
            drawerStatusSelect.value = status;
        }
    }
};

// Details Drawer Management
window.openDetailsDrawer = function(domain, matchKeyword) {
    activeDrawerDomain = domain;
    const info = crmDatabase[domain];
    
    drawerDomain.textContent = domain;
    drawerMatchBadge.textContent = info.whyMatched || `Matched: ${matchKeyword}`;
    drawerCountryBadge.textContent = info.country ? `Country: ${info.country}` : 'Country: Unaudited';
    drawerStatusSelect.value = info.status || 'New';
    
    // Load note & inputs
    drawerNotes.value = info.notes || '';
    drawerEmail.value = info.email || '';
    drawerPage.value = info.contactPage || '';
    drawerInstagram.value = info.socials.instagram || '';
    drawerFacebook.value = info.socials.facebook || '';
    drawerLinkedIn.value = info.socials.linkedin || '';
    drawerTwitter.value = info.socials.twitter || '';

    // Load Score & Insights UI
    renderScoreAndInsights(info);

    // Show Drawer
    detailsDrawer.classList.remove('hidden');
};

function closeDrawer() {
    detailsDrawer.classList.add('hidden');
    activeDrawerDomain = null;
    renderResultsTable(searchInput.value.trim().toLowerCase()); // Refresh score badges / status selectors in main table
}

// Render Score Circle and Insights UI
function renderScoreAndInsights(info) {
    const scoreVal = document.getElementById('drawer-score-val');
    const scoreOuter = document.querySelector('.score-circle-outer');
    
    // Reset classes
    scoreOuter.className = 'score-circle-outer';

    if (info.score === null) {
        scoreVal.textContent = '--';
        drawerInsights.innerHTML = `
            <div class="insight-empty">
                Click "Run Audit Scan" above to analyze this domain and generate recommendations.
            </div>
        `;
    } else {
        scoreVal.textContent = info.score;
        
        // Add color mapping
        if (info.score > 60) {
            scoreOuter.classList.add('high');
        } else if (info.score > 30) {
            scoreOuter.classList.add('medium');
        } else {
            scoreOuter.classList.add('good');
        }

        // Render Insights list
        drawerInsights.innerHTML = '';
        const insights = generateInsightsList(info);
        
        if (insights.length === 0) {
            drawerInsights.innerHTML = `<div class="insight-empty">Audit complete. No warnings or opportunities found!</div>`;
        } else {
            insights.forEach(ins => {
                const item = document.createElement('div');
                item.className = `insight-item ${ins.type}`;
                item.innerHTML = `
                    <div style="font-weight:600;margin-right:0.35rem;">${ins.type === 'positive' ? '✓' : '⚠'}</div>
                    <div>
                        <strong>${escapeHTML(ins.title)}</strong><br>
                        <span style="font-size:0.75rem;color:var(--text-secondary);">${escapeHTML(ins.desc)}</span>
                    </div>
                `;
                drawerInsights.appendChild(item);
            });
        }
    }
}

// Opportunity Scoring & Insight Rules Engine
function calculateOpportunityScore(audit) {
    let score = 0;
    
    if (!audit.active) {
        // Domain is registered but website does not respond or exist
        return 20; // Specific static score (easy landing page pitch!)
    }

    // SSL Missing check
    if (!audit.https) score += 15;
    
    // Site Builders check
    if (['Wix', 'Squarespace', 'Weebly'].includes(audit.cms)) {
        score += 10;
    }
    
    // Speed checks
    if (audit.responseTime && audit.responseTime > 1500) {
        score += 10;
    }
    
    // Missing social channels
    const hasSocials = Object.values(audit.socials).some(link => link !== null && link !== '');
    if (!hasSocials) score += 5;
    
    // Call-To-Action (CTA) check
    if (!audit.hasCta) score += 10;

    // Contact info presence
    if (audit.emails.length === 0 && !audit.contactPage) {
        score += 10;
    }
    
    // Domain age < 90 days would go here (+10) - we mock this as we don't have WHOIS details, 
    // but we add it to the base score if we detect a fresh launch
    score += 10; // Default weight for fresh registered domains

    return Math.min(Math.max(score, 0), 100);
}

// Generate Insights list from Audit Results
function generateInsightsList(info) {
    const list = [];
    const audit = info.auditResult;
    
    if (!audit) return list;

    if (!audit.active) {
        list.push({
            type: 'positive',
            title: 'No Website Detected',
            desc: 'The domain exists but has no active website. Perfect opportunity to sell a custom landing page.'
        });
        return list;
    }

    // HTTPS SSL Certificate
    if (!audit.https) {
        list.push({
            type: 'negative',
            title: 'Insecure Website (No HTTPS)',
            desc: 'Site loads over HTTP. Chrome will show "Not Secure" warning. Pitch SSL installation (+15 score).'
        });
    } else {
        list.push({
            type: 'positive',
            title: 'Secure Connection',
            desc: 'SSL/HTTPS is correctly installed and active.'
        });
    }

    // CMS Platform
    if (['Wix', 'Squarespace', 'Weebly'].includes(audit.cms)) {
        list.push({
            type: 'warning',
            title: `Built on ${audit.cms}`,
            desc: 'Proprietary platform used. Great chance to pitch a migration to a high-performance custom React/Next.js site (+10 score).'
        });
    } else if (audit.cms) {
        list.push({
            type: 'positive',
            title: `Platform: ${audit.cms}`,
            desc: `Site is running on ${audit.cms}.`
        });
    }

    // Response time speed
    if (audit.responseTime > 1500) {
        list.push({
            type: 'negative',
            title: `Slow Performance (${audit.responseTime}ms)`,
            desc: 'Website is slow to respond, hurting search engine ranking and user conversion (+10 score).'
        });
    } else if (audit.responseTime) {
        list.push({
            type: 'positive',
            title: `Fast Load Speed (${audit.responseTime}ms)`,
            desc: 'Server responds quickly, indicating good hosting latency.'
        });
    }

    // CTA Check
    if (!audit.hasCta) {
        list.push({
            type: 'negative',
            title: 'No Clear Call-To-Action (CTA)',
            desc: 'No booking buttons or lead capture forms found on the landing page (+10 score).'
        });
    } else {
        list.push({
            type: 'positive',
            title: 'CTA Found',
            desc: 'Clear conversion prompts detected on page.'
        });
    }

    // Socials Check
    const hasSocials = Object.values(audit.socials).some(link => link !== null && link !== '');
    if (!hasSocials) {
        list.push({
            type: 'warning',
            title: 'Missing Social Profiles',
            desc: 'No Facebook, Instagram, or LinkedIn pages linked to the site (+5 score).'
        });
    }

    // Emails / Contact Check
    if (audit.emails.length === 0 && !audit.contactPage) {
        list.push({
            type: 'negative',
            title: 'No Direct Contact Details',
            desc: 'Could not find any emails or contact pages on the homepage (+10 score).'
        });
    }

    return list;
}

// Call Serverless Audit Endpoint
async function runAuditOnActiveDomain() {
    if (!activeDrawerDomain) return;

    drawerAuditBtn.disabled = true;
    drawerAuditBtn.textContent = 'Auditing...';
    
    try {
        const response = await fetch(`/api/audit?domain=${encodeURIComponent(activeDrawerDomain)}`);
        if (!response.ok) {
            throw new Error(`Server returned status: ${response.status}`);
        }
        
        const auditData = await response.json();
        
        // Calculate Score
        const opportunityScore = calculateOpportunityScore(auditData);
        
        // Update Local State
        const info = crmDatabase[activeDrawerDomain];
        info.score = opportunityScore;
        info.auditResult = auditData;
        info.country = auditData.country || 'Unknown 🌐';
        drawerCountryBadge.textContent = `Country: ${info.country}`;
        
        // Autofill crawled details if available
        if (auditData.active) {
            if (auditData.emails && auditData.emails.length > 0) {
                info.email = auditData.emails[0];
                drawerEmail.value = info.email;
            }
            if (auditData.contactPage) {
                info.contactPage = auditData.contactPage;
                drawerPage.value = info.contactPage;
            }
            if (auditData.socials) {
                if (auditData.socials.instagram) {
                    info.socials.instagram = auditData.socials.instagram;
                    drawerInstagram.value = info.socials.instagram;
                }
                if (auditData.socials.facebook) {
                    info.socials.facebook = auditData.socials.facebook;
                    drawerFacebook.value = info.socials.facebook;
                }
                if (auditData.socials.linkedin) {
                    info.socials.linkedin = auditData.socials.linkedin;
                    drawerLinkedIn.value = info.socials.linkedin;
                }
                if (auditData.socials.twitter) {
                    info.socials.twitter = auditData.socials.twitter;
                    drawerTwitter.value = info.socials.twitter;
                }
            }
        }
        
        saveCrmDatabase();
        
        // Render Updates
        renderScoreAndInsights(info);

    } catch (e) {
        console.error(e);
        alert(`Audit failed: ${e.message}`);
    } finally {
        drawerAuditBtn.disabled = false;
        drawerAuditBtn.textContent = 'Run Audit Scan';
    }
}

// Save Drawer Data (Notes, manual contact fields, status)
function saveDrawerData() {
    if (!activeDrawerDomain) return;
    
    const info = crmDatabase[activeDrawerDomain];
    info.status = drawerStatusSelect.value;
    info.notes = drawerNotes.value.trim();
    info.email = drawerEmail.value.trim();
    info.contactPage = drawerPage.value.trim();
    info.socials.instagram = drawerInstagram.value.trim();
    info.socials.facebook = drawerFacebook.value.trim();
    info.socials.linkedin = drawerLinkedIn.value.trim();
    info.socials.twitter = drawerTwitter.value.trim();
    
    saveCrmDatabase();
    closeDrawer();
}

// Upgraded Export logic to include score, CRM pipeline status, country, and scraped emails
function exportCSV() {
    if (foundLeads.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Domain,Why Matched,Opportunity Score,Country,Pipeline Status,Email,Contact Page,Notes\r\n";
    
    foundLeads.forEach(lead => {
        const crmInfo = crmDatabase[lead.domain] || { status: 'New', score: '', notes: '', email: '', contactPage: '', country: '', whyMatched: `Keyword: ${lead.match}` };
        
        // Sanitize values for CSV (escaping quotes, wrapping in quotes if containing commas)
        const whyMatchedClean = crmInfo.whyMatched ? crmInfo.whyMatched.replace(/"/g, '""') : `Keyword: ${lead.match}`;
        const notesClean = crmInfo.notes ? crmInfo.notes.replace(/"/g, '""').replace(/\r?\n/g, ' ') : '';
        const scoreClean = crmInfo.score !== null ? `${crmInfo.score}/100` : 'Unaudited';
        const countryClean = crmInfo.country || 'Unaudited';
        
        csvContent += `"${lead.domain}","${whyMatchedClean}","${scoreClean}","${countryClean}","${crmInfo.status}","${crmInfo.email}","${crmInfo.contactPage}","${notesClean}"\r\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `domain_leads_crm_${formatDate(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportTXT() {
    if (foundLeads.length === 0) return;
    
    let txtContent = "# Daily Domain Leads Export\r\n\r\n";
    foundLeads.forEach(lead => {
        const crmInfo = crmDatabase[lead.domain] || { status: 'New', score: '', email: '', contactPage: '', country: '' };
        const scoreClean = crmInfo.score !== null ? `${crmInfo.score}/100` : 'Unaudited';
        
        txtContent += `Domain: ${lead.domain}\r\n`;
        txtContent += `Score: ${scoreClean}\r\n`;
        txtContent += `Country: ${crmInfo.country || 'Unaudited'}\r\n`;
        txtContent += `Status: ${crmInfo.status}\r\n`;
        if (crmInfo.email) txtContent += `Email: ${crmInfo.email}\r\n`;
        if (crmInfo.contactPage) txtContent += `Contact: ${crmInfo.contactPage}\r\n`;
        txtContent += `----------------------------------------\r\n`;
    });
    
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(txtContent));
    element.setAttribute('download', `domain_leads_${formatDate(new Date())}.txt`);
    
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// Utility functions
function escapeHTML(str) {
    if (!str) return '';
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
