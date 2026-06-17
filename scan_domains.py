import os
import re
import zipfile
import requests
from bs4 import BeautifulSoup
from datetime import datetime

# Directory to store downloads relative to the script directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(SCRIPT_DIR, "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

def fetch_latest_whoisds_zip():
    """
    Scrapes the WhoisDS newly-registered-domains page to find the latest daily ZIP file.
    Downloads and extracts it.
    """
    url = "https://whoisds.com/newly-registered-domains"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    print("Fetching newly registered domains list page from WhoisDS...")
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
    except Exception as e:
        print(f"Error fetching the page: {e}")
        return None
        
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # WhoisDS links are base64-encoded dates like:
    # https://whoisds.com//whois-database/newly-registered-domains/MjAyNi0wNi0xNS56aXA=/nrd
    zip_link = None
    for link in soup.find_all('a', href=True):
        href = link['href']
        if '/whois-database/newly-registered-domains/' in href and '/nrd' in href:
            zip_link = href
            break
            
    if not zip_link:
        # Fallback: try to find any link containing 'whois-database/newly-registered-domains'
        for link in soup.find_all('a', href=True):
            href = link['href']
            if 'whois-database/newly-registered-domains' in href:
                zip_link = href
                break

    if not zip_link:
        print("Could not find the latest ZIP link on the page.")
        print("Please visit https://whoisds.com/newly-registered-domains to download the file manually.")
        return None
        
    if not zip_link.startswith('http'):
        zip_link = "https://whoisds.com" + zip_link if zip_link.startswith('/') else "https://whoisds.com/" + zip_link

    # Extract filename or base64 token
    parts = zip_link.strip('/').split('/')
    filename = "newly_registered_domains.zip"
    if len(parts) >= 2:
        token = parts[-2]
        try:
            import base64
            decoded = base64.b64decode(token).decode('utf-8')
            if decoded.endswith('.zip'):
                filename = decoded
        except Exception:
            pass

    zip_filename = os.path.join(DOWNLOAD_DIR, filename)
    
    if os.path.exists(zip_filename):
        print(f"ZIP file {zip_filename} already exists. Skipping download.")
    else:
        print(f"Found latest ZIP link: {zip_link}")
        print(f"Downloading to {zip_filename}...")
        try:
            r = requests.get(zip_link, headers=headers, stream=True, timeout=30)
            r.raise_for_status()
            with open(zip_filename, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            print("Download complete.")
        except Exception as e:
            print(f"Failed to download ZIP file: {e}")
            return None

    # Unzipping
    extracted_file_path = None
    try:
        with zipfile.ZipFile(zip_filename, 'r') as zip_ref:
            # Get the list of files in zip
            namelist = zip_ref.namelist()
            if namelist:
                # Typically there's one text file
                txt_filename = namelist[0]
                extracted_file_path = os.path.join(DOWNLOAD_DIR, txt_filename)
                if os.path.exists(extracted_file_path):
                    print(f"Extracted file already exists at: {extracted_file_path}. Skipping extraction.")
                else:
                    zip_ref.extract(txt_filename, DOWNLOAD_DIR)
                    print(f"Extracted file to: {extracted_file_path}")
    except Exception as e:
        print(f"Failed to extract ZIP file: {e}")
        
    return extracted_file_path

def scan_for_local_leads(file_path):
    target_keywords = ['squamish', 'whistler', 'pemberton', 'seatosky']
    found_leads = []

    if not file_path or not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    print(f"Scanning {file_path} for Sea to Sky domains...")

    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                domain = line.split(',')[0].strip().lower()
                
                if not domain or domain.startswith('#') or domain.startswith('domain'):
                    continue
                    
                if any(keyword in domain for keyword in target_keywords):
                    found_leads.append(domain)
    except Exception as e:
        print(f"Error scanning file: {e}")
        return

    print(f"\nFound {len(found_leads)} local leads:")
    for lead in found_leads:
        print(f" - {lead}")
        
    # Write output to a results file relative to the script directory
    results_file = os.path.join(SCRIPT_DIR, "leads_found.txt")
    with open(results_file, 'w', encoding='utf-8') as f:
        f.write(f"# Found {len(found_leads)} leads on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        for lead in found_leads:
            f.write(f"{lead}\n")
    print(f"\nResults saved to {results_file}")

if __name__ == "__main__":
    # Attempt to auto-fetch today's list
    extracted_file = fetch_latest_whoisds_zip()
    
    if extracted_file:
        scan_for_local_leads(extracted_file)
    else:
        # If auto-fetch fails due to changes in site layout or captchas, prompt manual mode
        print("\nAuto-fetch could not complete.")
        print("Please download manually and place the file in the downloads/ directory.")
        print("Then run: python scan_domains.py <path_to_txt_file>")
