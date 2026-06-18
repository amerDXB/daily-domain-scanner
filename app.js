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
const drawerLostOpp = document.getElementById('drawer-lost-opp');
const drawerOutreachText = document.getElementById('drawer-outreach-text');
const copyOutreachBtn = document.getElementById('copy-outreach-btn');
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
    
    // Copy Outreach Template Button
    copyOutreachBtn.addEventListener('click', () => {
        drawerOutreachText.select();
        drawerOutreachText.setSelectionRange(0, 99999); // For mobile
        try {
            navigator.clipboard.writeText(drawerOutreachText.value);
        } catch (err) {
            document.execCommand('copy'); // Fallback
        }
        const oldText = copyOutreachBtn.textContent;
        copyOutreachBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyOutreachBtn.textContent = oldText;
        }, 2000);
    });

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
                    <option value="Qualified" ${crmInfo.status === 'Qualified' ? 'selected' : ''}>Qualified</option>
                    <option value="Contacted" ${crmInfo.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
                    <option value="Replied" ${crmInfo.status === 'Replied' ? 'selected' : ''}>Replied</option>
                    <option value="Meeting" ${crmInfo.status === 'Meeting' ? 'selected' : ''}>Meeting</option>
                    <option value="Won" ${crmInfo.status === 'Won' ? 'selected' : ''}>Won</option>
                    <option value="Closed" ${crmInfo.status === 'Closed' ? 'selected' : ''}>Closed</option>
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
    drawerLostOpp.className = 'badge-status badge-status-new';
    drawerLostOpp.textContent = 'Lost Opp: --';
    drawerOutreachText.value = '';

    // Reset Contact Discovery section elements
    document.getElementById('drawer-contact-confidence').textContent = '--';
    document.getElementById('drawer-contact-confidence').style.background = 'rgba(255, 255, 255, 0.05)';
    document.getElementById('drawer-contact-confidence').style.color = 'var(--text-secondary)';
    document.getElementById('drawer-mx-status').textContent = '--';
    document.getElementById('drawer-email-provider').textContent = '--';
    document.getElementById('drawer-candidate-emails').innerHTML = '';
    document.getElementById('drawer-candidates-wrapper').classList.add('hidden');
    document.getElementById('drawer-next-action').textContent = 'Run domain audit scan to see recommendation.';
    document.getElementById('drawer-next-action').style.color = 'var(--text-muted)';

    if (info.score === null) {
        scoreVal.textContent = '--';
        drawerInsights.innerHTML = `
            <div class="insight-empty">
                Click "Run Audit Scan" above to analyze this domain and generate recommendations.
            </div>
        `;
    } else {
        scoreVal.textContent = info.score;
        const audit = info.auditResult;

        // Populate DNS & MX Contact Discovery Details
        if (audit) {
            const mxStatusEl = document.getElementById('drawer-mx-status');
            const emailProviderEl = document.getElementById('drawer-email-provider');
            const confidenceEl = document.getElementById('drawer-contact-confidence');
            const candidatesWrapper = document.getElementById('drawer-candidates-wrapper');
            const candidateEmailsEl = document.getElementById('drawer-candidate-emails');
            const nextActionEl = document.getElementById('drawer-next-action');

            // MX record status
            if (audit.mxFound) {
                mxStatusEl.textContent = 'Active (MX Found)';
                mxStatusEl.style.color = '#10b981';
                emailProviderEl.textContent = audit.emailProvider || 'Unknown';
                
                // Show candidate email recommendations
                candidatesWrapper.classList.remove('hidden');
                candidateEmailsEl.innerHTML = '';
                const prefixes = ['info', 'hello', 'contact', 'sales', 'admin'];
                prefixes.forEach(prefix => {
                    const candidate = `${prefix}@${activeDrawerDomain}`;
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.justify = 'space-between';
                    row.style.alignItems = 'center';
                    row.style.background = 'rgba(255, 255, 255, 0.02)';
                    row.style.padding = '0.25rem 0.5rem';
                    row.style.borderRadius = '0.35rem';
                    row.style.fontSize = '0.75rem';
                    row.innerHTML = `
                        <span style="font-family: monospace; color:#cbd5e1;">${candidate}</span>
                        <div style="display:flex; gap:0.25rem;">
                            <button type="button" class="btn btn-secondary" style="padding: 0.15rem 0.35rem; font-size: 0.65rem;" onclick="copyToClipboard('${candidate}', this)">Copy</button>
                            <button type="button" class="btn btn-secondary" style="padding: 0.15rem 0.35rem; font-size: 0.65rem;" onclick="verifyCandidateEmail('${candidate}', this)">Verify</button>
                        </div>
                    `;
                    candidateEmailsEl.appendChild(row);
                });
            } else {
                mxStatusEl.textContent = 'None Found';
                mxStatusEl.style.color = '#ef4444';
                emailProviderEl.textContent = 'No Mail Setup';
                emailProviderEl.style.color = 'var(--text-muted)';
            }

            // Calculate Contact Confidence Score
            let confidence = 0;
            if (audit.mxFound) confidence += 40;
            if (info.email) confidence += 40;
            if (audit.contactPage) confidence += 10;
            const hasSocials = Object.values(audit.socials || {}).some(link => link !== null && link !== '');
            if (hasSocials) confidence += 10;

            confidenceEl.textContent = `${confidence}%`;
            if (confidence >= 70) {
                confidenceEl.style.background = 'rgba(16, 185, 129, 0.15)';
                confidenceEl.style.color = '#10b981';
                confidenceEl.style.borderColor = 'rgba(16, 185, 129, 0.25)';
            } else if (confidence >= 40) {
                confidenceEl.style.background = 'rgba(245, 158, 11, 0.15)';
                confidenceEl.style.color = '#f59e0b';
                confidenceEl.style.borderColor = 'rgba(245, 158, 11, 0.25)';
            } else {
                confidenceEl.style.background = 'rgba(239, 68, 68, 0.15)';
                confidenceEl.style.color = '#ef4444';
                confidenceEl.style.borderColor = 'rgba(239, 68, 68, 0.25)';
            }

            // Pipeline next action advice
            if (!audit.active && !audit.mxFound) {
                nextActionEl.textContent = '🔴 No Website & No Mail setup. Recommended action: Place in monitoring queue.';
                nextActionEl.style.color = '#ef4444';
            } else if (!audit.active && audit.mxFound) {
                nextActionEl.textContent = '🟡 No active Website, but MX mail setup detected! Recommended action: Try cold emailing unverified candidates.';
                nextActionEl.style.color = '#f59e0b';
            } else if (audit.active && audit.contactPage) {
                nextActionEl.textContent = '🟢 Website is active with a Contact Form page. Recommended action: Submit pitch via contact form.';
                nextActionEl.style.color = '#10b981';
            } else if (audit.active && hasSocials && !info.email) {
                nextActionEl.textContent = '🔵 Active site with social links only. Recommended action: Send outreach pitch via Instagram/Facebook DM.';
                nextActionEl.style.color = 'var(--accent-teal)';
            } else {
                nextActionEl.textContent = '🟢 Active site found. Recommended action: Review contact page or audit details.';
                nextActionEl.style.color = 'var(--text-primary)';
            }
        }

        
        // Add color mapping
        if (info.score > 60) {
            scoreOuter.classList.add('high');
        } else if (info.score > 30) {
            scoreOuter.classList.add('medium');
        } else {
            scoreOuter.classList.add('good');
        }

        // 1. Calculate Estimated Lost Opportunity (High / Medium / Low)
        let lostOppLevel = 'Low';
        let lostOppClass = 'badge-status-interested'; // green
        
        const audit = info.auditResult;
        if (audit) {
            if (!audit.active || audit.preLaunch) {
                lostOppLevel = 'High';
                lostOppClass = 'badge-status-closed'; // red
            } else if (!audit.https && audit.emails.length === 0 && !audit.contactPage) {
                lostOppLevel = 'High';
                lostOppClass = 'badge-status-closed';
            } else if (!audit.hasCta || (audit.responseTime > 1500) || (['Wix', 'Squarespace', 'Weebly'].includes(audit.cms) && (!audit.hasCta || audit.responseTime > 1500))) {
                lostOppLevel = 'Medium';
                lostOppClass = 'badge-status-followed_up'; // orange
            }
        }
        drawerLostOpp.textContent = `Lost Opp: ${lostOppLevel}`;
        drawerLostOpp.className = `badge-status ${lostOppClass}`;

        // 2. Generate Suggested Outreach Message
        let outreachMessage = '';
        if (audit) {
            if (!audit.active) {
                outreachMessage = `Hi there,\n\nI saw that you recently registered ${activeDrawerDomain}. Congratulations on the new domain!\n\nI noticed there is no website active on it yet. If you are looking to build a high-performance web presence or a local landing page to start driving customers in your area, I'd love to help you design a modern custom site.\n\nAre you open to a quick 10-minute chat to discuss what you have planned for the new domain?\n\nBest,\n[Your Name]`;
            } else if (audit.preLaunch) {
                outreachMessage = `Hi,\n\nI came across ${activeDrawerDomain} while researching new local businesses. It looks like the site may still be in the early setup stage.\n\nI had a few ideas that could help turn it into a simple launch page and start collecting inquiries before the full website is ready. Happy to share if useful.\n\nBest,\n[Your Name]`;
            } else {
                let issuesList = [];
                if (!audit.https) {
                    issuesList.push(`• Secure Connection: Your site currently shows a 'Not Secure' warning in Google Chrome. We can fix this by installing an SSL certificate so visitors feel safe submitting their information.`);
                }
                if (!audit.hasCta) {
                    issuesList.push(`• No Clear Call-To-Action (CTA): I noticed there isn't a clear action path (like a 'Book Now' or 'Get a Quote' button) prominently featured on the homepage to capture leads.`);
                }
                if (audit.responseTime > 1500) {
                    issuesList.push(`• Slow Performance: The site takes quite a while to load on mobile (${audit.responseTime}ms), which can cause potential customers to bounce before the page loads.`);
                }
                if (audit.emails.length === 0 && !audit.contactPage) {
                    issuesList.push(`• Direct Contact Path: It is currently difficult for visitors to find a direct contact form or email address on the main page.`);
                }
                if (['Wix', 'Squarespace', 'Weebly'].includes(audit.cms) && (!audit.hasCta || audit.responseTime > 1500)) {
                    issuesList.push(`• Platform Optimization: Since the site is built on ${audit.cms} and experiencing speed/CTA limitations, upgrading to a custom high-performance layout would significantly improve your conversions.`);
                }

                if (issuesList.length > 0) {
                    outreachMessage = `Hi there,\n\nI was doing some local market research and came across ${activeDrawerDomain}. I noticed a few quick wins that could help you convert more visitors into paying customers:\n\n${issuesList.join('\n')}\n\nI'd be happy to show you how a few quick updates could help boost your inquiries. Would you be open to a quick call this week?\n\nBest,\n[Your Name]`;
                } else {
                    outreachMessage = `Hi there,\n\nI visited your website ${activeDrawerDomain} and was really impressed by the design and load speed. It looks fantastic!\n\nI specialize in helping local businesses drive traffic to their sites. Since your website foundation is already strong, I'd love to discuss some SEO and traffic growth strategies with you.\n\nAre you open to a quick call next week?\n\nBest,\n[Your Name]`;
                }
            }
        }
        drawerOutreachText.value = outreachMessage;

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
        return 80; // High opportunity score for inactive domain
    }

    // Pre-launch/placeholder detection (High-signal opportunity)
    if (audit.preLaunch) {
        score += 25;
    }

    // SSL Missing check
    if (!audit.https) score += 15;
    
    // Conditional Builder scoring: Only add score (+10) if the CMS site has performance or conversion issues
    if (['Wix', 'Squarespace', 'Weebly'].includes(audit.cms)) {
        if ((audit.responseTime && audit.responseTime > 1500) || !audit.hasCta) {
            score += 10;
        }
    }
    
    // Speed checks
    if (audit.responseTime && audit.responseTime > 1500) {
        score += 15;
    }
    
    // Missing social channels
    const hasSocials = Object.values(audit.socials).some(link => link !== null && link !== '');
    if (!hasSocials) score += 5;
    
    // Call-To-Action (CTA) check
    if (!audit.hasCta) score += 15;

    // Contact info presence
    if (audit.emails.length === 0 && !audit.contactPage) {
        score += 15;
    }
    
    // Default base score for new domains
    score += 10;

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

    // Pre-launch indicator
    if (audit.preLaunch) {
        list.push({
            type: 'negative',
            title: 'Website Appears Pre-launch',
            desc: 'Found default posts, sample pages, coming soon placeholders, or empty WooCommerce catalogs (+25 score).'
        });
        list.push({
            type: 'warning',
            title: 'Launch Essentials Missing',
            desc: 'Missing key elements like conversion structures, brand setup, proper SEO foundation, and email captures.'
        });
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

// Global helper: Copy specific text to clipboard and update button text temporarily
window.copyToClipboard = function(text, btn) {
    try {
        navigator.clipboard.writeText(text);
    } catch (e) {
        const tempInput = document.createElement('input');
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
    }
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.disabled = true;
    setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
    }, 1500);
};

// Global helper: Verify candidate email (simulated)
window.verifyCandidateEmail = async function(email, btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Checking...';
    btn.disabled = true;
    
    // Simulate endpoint request latency
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const outcomes = [
        { label: 'Valid ✅', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
        { label: 'Catch-all ⚠️', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)' },
        { label: 'Risky ⚡', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' }
    ];
    
    // Random outcome simulator
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];
    
    btn.textContent = result.label;
    btn.style.color = result.color;
    btn.style.background = result.bg;
    btn.style.borderColor = result.color;
    btn.disabled = true; // Stay verified
};
