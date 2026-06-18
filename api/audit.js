const http = require('http');
const https = require('https');
const { URL } = require('url');
const dns = require('dns').promises;

// Helper to perform requests with a timeout
function fetchUrl(urlStr, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(urlStr);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            const startTime = Date.now();

            const options = {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
                timeout: timeoutMs
            };

            const req = client.request(parsedUrl, options, (res) => {
                // Redirect support (max 3 jumps)
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    req.destroy();
                    // Resolve location to let client handle redirect if needed or follow
                    resolve({ redirect: res.headers.location, statusCode: res.statusCode });
                    return;
                }

                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                    // Cap data size at 500KB to prevent memory issues
                    if (data.length > 500000) {
                        req.destroy();
                        resolve({ html: data, headers: res.headers, statusCode: res.statusCode, responseTime: Date.now() - startTime });
                    }
                });

                res.on('end', () => {
                    resolve({
                        html: data,
                        headers: res.headers,
                        statusCode: res.statusCode,
                        responseTime: Date.now() - startTime
                    });
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout'));
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = async (req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { domain } = req.query;

    if (!domain) {
        return res.status(400).json({ error: 'Missing domain parameter' });
    }

    // Clean up domain format
    let targetDomain = domain.trim().toLowerCase();
    targetDomain = targetDomain.replace(/^(https?:\/\/)?(www\.)?/, '');

    const result = {
        domain: targetDomain,
        active: false,
        https: false,
        statusCode: null,
        responseTime: null,
        cms: null,
        socials: {
            facebook: null,
            instagram: null,
            linkedin: null,
            twitter: null
        },
        emails: [],
        contactPage: null,
        hasCta: false,
        country: null,
        preLaunch: false,
        mxFound: false,
        emailProvider: 'Unknown',
        spfPresent: false,
        dkimPresent: false,
        dmarcPresent: false,
        errorMessage: null
    };

    try {
        // 0. Perform DNS MX Check & Provider detection
        try {
            const mxRecords = await dns.resolveMx(targetDomain);
            if (mxRecords && mxRecords.length > 0) {
                result.mxFound = true;
                
                // Sort by priority to check the primary MX record first
                mxRecords.sort((a, b) => a.priority - b.priority);
                const primaryExchange = mxRecords[0].exchange.toLowerCase();
                
                if (primaryExchange.includes('google.com') || primaryExchange.includes('googlemail.com') || primaryExchange.includes('aspmx.l.google.com')) {
                    result.emailProvider = 'Google Workspace';
                } else if (primaryExchange.includes('outlook.com') || primaryExchange.includes('mail.protection.outlook.com')) {
                    result.emailProvider = 'Microsoft 365';
                } else if (primaryExchange.includes('zoho.com') || primaryExchange.includes('zoho.eu')) {
                    result.emailProvider = 'Zoho';
                } else if (primaryExchange.includes('shopify.com')) {
                    result.emailProvider = 'Shopify Email';
                } else if (primaryExchange.includes('secureserver.net') || primaryExchange.includes('godaddy.com')) {
                    result.emailProvider = 'GoDaddy';
                } else if (primaryExchange.includes('mx.cloudflare.net')) {
                    result.emailProvider = 'Cloudflare Email Routing';
                } else {
                    result.emailProvider = 'Other / Custom';
                }
            }
        } catch (dnsErr) {
            // MX lookup failed, means no MX records found or DNS error
            result.mxFound = false;
            result.emailProvider = 'None';
        }

        // 0.5 Check SPF, DKIM, DMARC TXT records
        if (result.mxFound) {
            try {
                // Check SPF: Look for txt records starting with "v=spf1"
                const txtRecords = await dns.resolveTxt(targetDomain);
                if (txtRecords && txtRecords.length > 0) {
                    result.spfPresent = txtRecords.some(record => {
                        const fullStr = record.join('').toLowerCase();
                        return fullStr.includes('v=spf1');
                    });
                }
            } catch (spfErr) {
                result.spfPresent = false;
            }

            try {
                // Check DMARC: Look at _dmarc subdomain txt records
                const dmarcRecords = await dns.resolveTxt(`_dmarc.${targetDomain}`);
                if (dmarcRecords && dmarcRecords.length > 0) {
                    result.dmarcPresent = dmarcRecords.some(record => {
                        const fullStr = record.join('').toLowerCase();
                        return fullStr.includes('v=dmarc1');
                    });
                }
            } catch (dmarcErr) {
                result.dmarcPresent = false;
            }

            // Check DKIM: Try standard selectors (google, default, k1, mail)
            const selectors = ['google', 'default', 'k1', 'mail'];
            for (const selector of selectors) {
                try {
                    const dkimRecords = await dns.resolveTxt(`${selector}._domainkey.${targetDomain}`);
                    if (dkimRecords && dkimRecords.length > 0) {
                        const hasDkim = dkimRecords.some(record => {
                            const fullStr = record.join('').toLowerCase();
                            return fullStr.includes('v=dkim1') || fullStr.includes('p=');
                        });
                        if (hasDkim) {
                            result.dkimPresent = true;
                            break;
                        }
                    }
                } catch (dkimErr) {
                    // Suppress and try next selector
                }
            }
        }

        let responseData = null;
        let usedHttps = true;

        // Try HTTPS first
        try {
            responseData = await fetchUrl(`https://${targetDomain}`);
            result.https = true;
        } catch (httpsErr) {
            // Fallback to HTTP
            usedHttps = false;
            try {
                responseData = await fetchUrl(`http://${targetDomain}`);
                result.https = false;
            } catch (httpErr) {
                throw new Error('Host unreachable on HTTP and HTTPS');
            }
        }

        // Handle direct redirect once if returned
        if (responseData && responseData.redirect) {
            try {
                let redirectUrl = responseData.redirect;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = (usedHttps ? 'https://' : 'http://') + targetDomain + (redirectUrl.startsWith('/') ? '' : '/') + redirectUrl;
                }
                responseData = await fetchUrl(redirectUrl);
            } catch (redirectErr) {
                // Ignore redirect fail and scan whatever we have
            }
        }

        if (!responseData || !responseData.html) {
            throw new Error('No content returned from website');
        }

        const html = responseData.html;
        result.active = true;
        result.statusCode = responseData.statusCode;
        result.responseTime = responseData.responseTime;

        // 1. Detect CMS / Site Builder
        const htmlLower = html.toLowerCase();
        if (htmlLower.includes('wix.com') || htmlLower.includes('wixpress') || htmlLower.includes('wix-code')) {
            result.cms = 'Wix';
        } else if (htmlLower.includes('squarespace.com') || htmlLower.includes('squarespace-tiles') || htmlLower.includes('static1.squarespace.com')) {
            result.cms = 'Squarespace';
        } else if (htmlLower.includes('cdn.shopify.com') || htmlLower.includes('shopify.theme')) {
            result.cms = 'Shopify';
        } else if (htmlLower.includes('weebly.com') || htmlLower.includes('weebly-theme') || htmlLower.includes('cdn2.editmysite.com')) {
            result.cms = 'Weebly';
        } else if (htmlLower.includes('/wp-content/') || htmlLower.includes('wp-embed') || htmlLower.includes('wordpress')) {
            result.cms = 'WordPress';
        }

        // 2. Scan for Social Links (Refined to match real profiles and exclude tracking pixels, favicons, etc.)
        const fbMatch = html.match(/href="([^"]*facebook\.com\/(?!(sharer|plugins|tr\?|groups))[a-zA-Z0-9._-]+)"/i);
        if (fbMatch) result.socials.facebook = fbMatch[1];

        const igMatch = html.match(/href="([^"]*instagram\.com\/(?!(developer|embed|explore|p\/))[a-zA-Z0-9._-]+)"/i);
        if (igMatch) result.socials.instagram = igMatch[1];

        const liMatch = html.match(/href="([^"]*linkedin\.com\/(in|company)\/[a-zA-Z0-9._-]+)"/i);
        if (liMatch) result.socials.linkedin = liMatch[1];

        const twMatch = html.match(/href="([^"]*(twitter\.com|x\.com)\/(?!(share|intent|favicon))[a-zA-Z0-9._-]+)"/i);
        if (twMatch) result.socials.twitter = twMatch[1];

        // 3. Scan for Contact Page
        const contactMatch = html.match(/href="([^"]*(contact|contact-us|get-in-touch|support)[^"]*)"/i);
        if (contactMatch) {
            let path = contactMatch[1];
            if (!path.startsWith('http')) {
                path = (result.https ? 'https://' : 'http://') + targetDomain + (path.startsWith('/') ? '' : '/') + path;
            }
            result.contactPage = path;
        }

        // 4. Scan for CTA (Call To Action Buttons)
        const ctaKeywords = ['book now', 'contact us', 'call now', 'get a quote', 'schedule', 'free consultation', 'learn more', 'hire us', 'sign up'];
        result.hasCta = ctaKeywords.some(keyword => htmlLower.includes(keyword));

        // 5. Scan for emails in raw HTML (excluding assets/images & system/builder templates)
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}/g;
        const matches = html.match(emailRegex) || [];
        const uniqueEmails = [...new Set(matches)].filter(email => {
            const lower = email.toLowerCase();
            const blocklist = ['sentry', 'wixpress', 'shopify', 'cloudflare', 'noreply', 'example.com', 'wix.com', 'template', 'support@', 'admin@', 'info@'];
            
            // Check if any blocklisted phrase matches
            const isBlocked = blocklist.some(term => {
                if (term.endsWith('@')) {
                    return lower.startsWith(term);
                }
                return lower.includes(term);
            });

            return !isBlocked && 
                   !lower.endsWith('.png') && 
                   !lower.endsWith('.jpg') && 
                   !lower.endsWith('.gif') && 
                   !lower.endsWith('.svg') && 
                   !lower.endsWith('.webp');
        });
        result.emails = uniqueEmails.slice(0, 3); // Max 3 emails

        // 6. Detect Country / Location (Canada vs USA vs Other)
        let detectedCountry = null;
        
        // Check Canadian Postal Code regex: [A-Z]\d[A-Z] \d[A-Z]\d
        const caPostalRegex = /\b[a-z]\d[a-z]\s?\d[a-z]\d\b/i;
        if (caPostalRegex.test(html)) {
            detectedCountry = 'Canada 🇨🇦';
        }
        
        // Check US Zip code regex: \b\d{5}(-\d{4})?\b
        if (!detectedCountry) {
            const usZipRegex = /\b\d{5}(-\d{4})?\b/;
            if (usZipRegex.test(html) && (htmlLower.includes('zip') || htmlLower.includes('usa') || htmlLower.includes('united states'))) {
                detectedCountry = 'United States 🇺🇸';
            }
        }
        
        // Check Canadian area codes
        if (!detectedCountry) {
            const caAreaCodes = ['604', '778', '250', '236', '403', '587', '825', '780', '306', '639', '204', '431', '416', '647', '437', '905', '289', '365', '705', '249', '613', '343', '519', '226', '548', '807', '514', '438', '450', '579', '418', '581', '819', '873', '506', '902', '782', '709', '867'];
            const hasCaPhone = caAreaCodes.some(code => {
                const regex = new RegExp(`\\b\\(?${code}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}\\b`);
                return regex.test(html);
            });
            if (hasCaPhone) {
                detectedCountry = 'Canada 🇨🇦';
            }
        }
        
        // Fallback checks
        if (!detectedCountry) {
            if (htmlLower.includes('cad$') || htmlLower.includes('cdn$') || htmlLower.includes('currency: cad') || htmlLower.includes('prices in cad')) {
                detectedCountry = 'Canada 🇨🇦';
            } else if (targetDomain.endsWith('.ca')) {
                detectedCountry = 'Canada 🇨🇦';
            }
        }
        
        result.country = detectedCountry || 'Unknown 🌐';

        // 7. Detect Pre-launch / Placeholder / Under Construction state
        const preLaunchIndicators = [
            'hello world!',
            'sample page',
            'coming soon',
            'under construction',
            'proudly powered by wordpress',
            'site is currently offline',
            'check back soon',
            'launching soon',
            'no products were found matching your selection',
            'empty shop',
            'wix.com. this site was designed with the .com website builder',
            'is registered at namecheap',
            'this domain is registered'
        ];
        
        result.preLaunch = preLaunchIndicators.some(indicator => htmlLower.includes(indicator));

    } catch (e) {
        result.active = false;
        result.errorMessage = e.message;
    }

    res.status(200).json(result);
};
