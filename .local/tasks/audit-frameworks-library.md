# Comprehensive Audit Framework Library

## What & Why
The platform currently has 22 compliance/cybersecurity frameworks. A full-featured audit management system needs the complete spectrum of audit framework types — internal audit standards, financial audit standards, IT audit frameworks, operational/quality frameworks, sector-specific regulations, risk management frameworks, ESG/sustainability standards, and cloud security frameworks. This brings ComplyVerse to parity with leading audit platforms like AuditBoard and HighBond, which offer broad framework libraries out of the box.

## Done looks like
- 40+ new framework JSON files added to `backend/grc/seed_data/frameworks/`, covering all major categories below
- Backend auto-seeds all new frameworks on startup (existing seeding logic is idempotent — no code changes needed)
- All frameworks appear in the platform's framework library with correct metadata (name, version, source organization, controls)
- Each framework has a minimum of 10–20 representative controls following the established JSON schema (`metadata` + `controls` array)
- Total framework count in the system grows from 22 to 60+

## Framework Categories to Add

### Internal Audit Standards (IIA / COSO)
- IIA International Standards for the Professional Practice of Internal Auditing (2024)
- COSO Internal Control — Integrated Framework (2013)
- COSO Enterprise Risk Management (ERM) Framework (2017)
- IIA Three Lines Model (2020)
- Risk-Based Internal Auditing (RBIA) Methodology

### IT Audit & Governance
- ISACA IT Audit Framework (ITAF) v4
- ITIL v4 (IT Service Management)
- ISO/IEC 20000-1:2018 (IT Service Management)
- ISO/IEC 38500:2015 (Corporate Governance of IT)
- NIST SP 800-171 (Controlled Unclassified Information)
- NIST SP 800-82 Rev 3 (ICS/SCADA Security)
- IEC 62443 (Industrial Cybersecurity)
- NIST SP 800-207 (Zero Trust Architecture)
- CSA STAR (Cloud Security Alliance)
- ISO/IEC 27017:2015 (Cloud Security)
- ISO/IEC 27018:2019 (Cloud Privacy)

### Financial Audit Standards
- IAASB International Standards on Auditing (ISA)
- GAAS — Generally Accepted Auditing Standards (AICPA)
- PCAOB Auditing Standards
- Basel III / Basel IV (Banking Capital & Liquidity)
- IFRS Audit-Related Standards
- GLBA — Gramm-Leach-Bliley Act (Financial Services Privacy)

### Operational & Quality Audit
- ISO 9001:2015 (Quality Management Systems)
- ISO 14001:2015 (Environmental Management Systems)
- ISO 45001:2018 (Occupational Health & Safety)
- ISO 50001:2018 (Energy Management)
- ISO 31000:2018 (Risk Management)

### Sector-Specific Regulations
- NERC CIP (North American Energy/Utilities Cybersecurity)
- FedRAMP (US Federal Cloud Authorization)
- FISMA (Federal Information Security Modernization Act)
- FERPA (Family Educational Rights and Privacy Act)
- CCPA/CPRA (California Consumer Privacy Act)
- Solvency II (EU Insurance Capital Requirements)
- FINRA Compliance Framework (Financial Industry)
- FDA 21 CFR Part 11 (Electronic Records — Pharma/Life Sciences)

### ESG & Sustainability Audit
- GRI (Global Reporting Initiative) Standards
- TCFD (Task Force on Climate-related Financial Disclosures)
- SASB (Sustainability Accounting Standards Board)
- CSRD (EU Corporate Sustainability Reporting Directive)
- ISO 14064-1 (Greenhouse Gas Accounting)

### Supply Chain & Procurement
- ISO 28000:2022 (Supply Chain Security Management)

## Out of scope
- UI changes — the existing framework library UI already supports any number of frameworks
- Framework upload or management UI changes
- Mapping frameworks to each other (cross-framework mapping is a separate feature)
- Frameworks already present in the system (idempotent seeding skips duplicates automatically)

## Tasks
1. **Create Internal Audit Standards JSON files** — Build JSON files for IIA Standards, COSO IC, COSO ERM, IIA Three Lines Model, and RBIA following the established `{ metadata, controls }` schema with accurate metadata and 15–25 representative controls each.

2. **Create IT Audit & Cloud Framework JSON files** — Build JSON files for ISACA ITAF, ITIL v4, ISO 20000, ISO 38500, NIST 800-171, NIST 800-82, IEC 62443, NIST 800-207 (Zero Trust), CSA STAR, ISO 27017, and ISO 27018.

3. **Create Financial Audit Standards JSON files** — Build JSON files for ISA, GAAS, PCAOB, Basel III/IV, IFRS, and GLBA with representative audit-focused controls.

4. **Create Operational, Quality & Risk JSON files** — Build JSON files for ISO 9001, ISO 14001, ISO 45001, ISO 50001, and ISO 31000.

5. **Create Sector-Specific Regulation JSON files** — Build JSON files for NERC CIP, FedRAMP, FISMA, FERPA, CCPA/CPRA, Solvency II, FINRA, and FDA 21 CFR Part 11.

6. **Create ESG, Sustainability & Supply Chain JSON files** — Build JSON files for GRI Standards, TCFD, SASB, CSRD, ISO 14064, and ISO 28000.

7. **Restart backend and verify seeding** — Restart the backend workflow, confirm all new frameworks seed without errors, and verify the total framework count reaches 60+ in the database.

## Relevant files
- `backend/grc/seed_data/frameworks/cis_controls.json`
- `backend/grc/seed_data/frameworks/iso_27001.json`
- `backend/grc/seed_data/frameworks/nist_csf.json`
- `backend/grc/seed_frameworks.py`
