import { FirFormData } from '@/lib/types';

// Native <input type="date"> fields always store/submit yyyy-mm-dd - reformat only
// for display here so the preview/print shows dd/mm/yyyy without touching the
// underlying form data or the date picker itself.
function formatDateDMY(iso?: string): string {
  if (!iso?.trim()) return '';
  const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso; // not an ISO date string (e.g. already free text) - show as-is
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

function RowsOrDash<T extends Record<keyof T, string>>({
  rows,
  cols,
}: {
  rows: T[];
  cols: (keyof T)[];
}) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={cols.length}>-</td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((r, i) => (
        <tr key={i}>
          {cols.map((c) => (
            <td key={String(c)}>{r[c] || ''}</td>
          ))}
        </tr>
      ))}
    </>
  );
}

function OccurrenceCards({ rows }: { rows: FirFormData['occurrenceTable'] }) {
  if (rows.length === 0) {
    return <p className="pv-freetext">—</p>;
  }
  return (
    <div className="pv-subcards">
      {rows.map((r, i) => (
        <div className="pv-subcard" key={i}>
          {rows.length > 1 && <div className="pv-subcard-title">Occurrence {i + 1}</div>}
          <div className="pv-grid">
            <Stat label="Date From" value={formatDateDMY(r.dateFrom)} />
            <Stat label="Time From" value={r.timeFrom} />
            <Stat label="Date To" value={formatDateDMY(r.dateTo)} />
            <Stat label="Time To" value={r.timeTo} />
            <Stat label="Direction" value={r.directionFromPs} />
            <Stat label="Distance" value={r.distanceFromPs} />
            <Stat label="Beat No" value={r.beatNo} />
            <Stat label="Coordinates" value={r.coordinates} />
            <Stat label="Outside P.S" value={r.outPs} />
            <Stat label="Outside District" value={r.outDistrict} />
            <Stat label="Outside State" value={r.outState} />
          </div>
          <div className="pv-subcard-address">
            <span className="pv-stat-label">Address</span>
            <span className="pv-stat-value">{r.address?.trim() || '—'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: string }) {
  return (
    <div className="pv-stat">
      <span className="pv-stat-label">{label}</span>
      <span className="pv-stat-value">{value?.trim() ? value : '—'}</span>
    </div>
  );
}

function Section({
  n,
  icon,
  title,
  children,
}: {
  n?: string;
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pv-card">
      <h3 className="pv-card-title">
        {n && <span className="pv-card-num">{n}</span>}
        <span className="pv-card-icon" aria-hidden="true">{icon}</span>
        {title}
      </h3>
      <div className="pv-card-body">{children}</div>
    </section>
  );
}

function PvTable<T extends Record<keyof T, string>>({
  cols,
  rows,
  headers,
}: {
  cols: (keyof T)[];
  rows: T[];
  headers: string[];
}) {
  return (
    <table className="pv-table">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <RowsOrDash rows={rows} cols={cols} />
      </tbody>
    </table>
  );
}

function ScreenPreview({ d }: { d: FirFormData }) {
  return (
    <div className="preview-doc">
      <div className="pv-hero">
        <div className="pv-hero-top">
          <span className="pv-hero-badge">CCTNS-R-IIF-1</span>
          <span className="pv-hero-badge pv-hero-badge--muted">Suo Mottu FIR</span>
        </div>
        <h1 className="pv-hero-title">
          FIR No. {d.firNo || 'XXX'}
          <span className="pv-hero-year">/{d.firYear || '—'}</span>
        </h1>
        <div className="pv-hero-grid">
          <Stat label="District" value={d.district} />
          <Stat label="Police Station" value={d.ps} />
          <Stat label="Date" value={formatDateDMY(d.firDate)} />
          <Stat label="Time" value={d.firTime} />
        </div>
      </div>

      <Section icon="📜" title="Acts &amp; Sections">
        <PvTable headers={['Act', 'Section']} cols={['act', 'section']} rows={d.actsTable} />
      </Section>

      <Section icon="🕒" title="Occurrence &amp; Place of Occurrence">
        <div className="pv-grid">
          <Stat label="Day" value={d.occDay} />
          <Stat label="Period" value={d.occPeriod} />
          <Stat label="Info Received" value={`${formatDateDMY(d.infoDay)} ${d.infoTime}`.trim()} />
          <Stat label="GD Entry" value={d.gdEntryNo ? `${d.gdEntryNo} at ${d.gdTime}` : ''} />
        </div>
        <OccurrenceCards rows={d.occurrenceTable} />
      </Section>

      <Section icon="ℹ️" title="Type of Information">
        <div className="pv-grid">
          <Stat label="Info Type" value={d.infoType} />
          <Stat label="Source" value={d.complaintSource} />
        </div>
      </Section>

      <Section icon="🧑" title="Complainant / Informant">
        <div className="pv-grid">
          <Stat label="Name" value={d.compName} />
          <Stat label="Relative's Name" value={d.compRelativeName} />
          <Stat label="Age" value={d.compAge} />
          <Stat label="Gender" value={d.compGender} />
          <Stat label="DOB" value={formatDateDMY(d.compDob)} />
          <Stat label="Nationality" value={d.compNationality} />
          <Stat label="UID" value={d.compUid} />
          <Stat label="Occupation" value={d.compOccupation} />
          <Stat label="Mobile" value={d.compMobile} />
          <Stat label="Land Phone" value={d.compLandPhone} />
        </div>
        <PvTable headers={['ID Type', 'ID Number']} cols={['idType', 'idNumber']} rows={d.idTable} />
        <PvTable headers={['Address Type', 'Address']} cols={['addressType', 'address']} rows={d.addressTable} />
      </Section>

      <Section icon="🕵️" title="Accused Details">
        <PvTable
          headers={['Name', 'Alias', 'Age', 'Gender', 'Nationality', "Father's Name", 'Tel', 'Present Address', 'Permanent Address']}
          cols={['name', 'alias', 'age', 'gender', 'nationality', 'fatherName', 'tel', 'presentAddress', 'permanentAddress']}
          rows={d.accusedTable}
        />
      </Section>

      <Section icon="🧍" title="Victim Details">
        <PvTable
          headers={['Name', 'Alias', 'Age', 'Gender', 'Nationality', "Father's Name", 'Tel', 'Present Address', 'Permanent Address']}
          cols={['name', 'alias', 'age', 'gender', 'nationality', 'fatherName', 'tel', 'presentAddress', 'permanentAddress']}
          rows={d.victimTable}
        />
      </Section>

      <Section icon="⏳" title="Reason for Delay">
        <p className="pv-freetext">{d.delayReason || '—'}</p>
      </Section>

      <Section icon="💎" title="Property Details">
        <PvTable
          headers={['Type', 'Sub Type', 'Description', 'Value (Rs)']}
          cols={['propType', 'subType', 'description', 'value']}
          rows={d.propertyTable}
        />
        <div className="pv-total">
          <span>Total Value</span>
          <span className="pv-total-value">Rs. {d.totalValue || '0.00'}</span>
        </div>
      </Section>

      <Section icon="⚖️" title="Inquest / UD Case">
        <div className="pv-grid">
          <Stat label="Type" value={d.inquestType} />
          <Stat label="Number" value={d.inquestNo} />
        </div>
      </Section>

      <Section icon="📝" title="First Information Contents">
        <p className="pv-narrative">{d.narrative || '—'}</p>
      </Section>

      <Section icon="👮" title="Investigating Officer">
        <div className="pv-grid">
          <Stat label="Name" value={d.ioName} />
          <Stat label="Rank" value={d.ioRank} />
          <Stat label="PEN" value={d.ioPen} />
          <Stat label="Mobile" value={d.ioMobile} />
          <Stat label="Age" value={d.ioAge} />
        </div>
      </Section>
    </div>
  );
}

function PrintDoc({ d }: { d: FirFormData }) {
  return (
    <div id="printPreview" className="print-only">
      <h1>Suo Mottu FIR - CCTNS-R-IIF-1</h1>
      <p>
        <strong>District:</strong> {d.district} &nbsp; <strong>PS:</strong> {d.ps} &nbsp;
        <strong>FIR No:</strong> {d.firNo || 'XXX'}/{d.firYear} &nbsp;
        <strong>Date/Time:</strong> {formatDateDMY(d.firDate)} {d.firTime}
      </p>

      <div className="section-title">Acts &amp; Sections</div>
      <table>
        <thead>
          <tr>
            <th>Act</th>
            <th>Section</th>
          </tr>
        </thead>
        <tbody>
          <RowsOrDash rows={d.actsTable} cols={['act', 'section']} />
        </tbody>
      </table>

      <div className="section-title">Occurrence &amp; Place of Occurrence</div>
      <p>
        Day: {d.occDay} | Period: {d.occPeriod}
        <br />
        Info received at PS: {formatDateDMY(d.infoDay)} {d.infoTime} | GD Entry: {d.gdEntryNo} at {d.gdTime}
      </p>
      <table>
        <thead>
          <tr>
            <th>Date From</th>
            <th>Time From</th>
            <th>Date To</th>
            <th>Time To</th>
            <th>Direction</th>
            <th>Distance</th>
            <th>Beat No</th>
            <th>Address</th>
            <th>Coordinates</th>
            <th>Outside P.S</th>
            <th>Outside District</th>
            <th>Outside State</th>
          </tr>
        </thead>
        <tbody>
          <RowsOrDash
            rows={d.occurrenceTable.map((r) => ({ ...r, dateFrom: formatDateDMY(r.dateFrom), dateTo: formatDateDMY(r.dateTo) }))}
            cols={[
              'dateFrom',
              'timeFrom',
              'dateTo',
              'timeTo',
              'directionFromPs',
              'distanceFromPs',
              'beatNo',
              'address',
              'coordinates',
              'outPs',
              'outDistrict',
              'outState',
            ]}
          />
        </tbody>
      </table>

      <div className="section-title">Type of Information</div>
      <p>
        {d.infoType} | Source: {d.complaintSource}
      </p>

      <div className="section-title">Complainant / Informant</div>
      <p>
        Name: {d.compName} | Relative: {d.compRelativeName} | Age: {d.compAge} | Gender: {d.compGender} | DOB: {formatDateDMY(d.compDob)}
        <br />
        Nationality: {d.compNationality} | UID: {d.compUid} | Occupation: {d.compOccupation}
        <br />
        Mobile: {d.compMobile} | Land Phone: {d.compLandPhone}
      </p>
      <table>
        <thead>
          <tr>
            <th>ID Type</th>
            <th>ID Number</th>
          </tr>
        </thead>
        <tbody>
          <RowsOrDash rows={d.idTable} cols={['idType', 'idNumber']} />
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>Address Type</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          <RowsOrDash rows={d.addressTable} cols={['addressType', 'address']} />
        </tbody>
      </table>

      <div className="section-title">Accused Details</div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Alias</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Nationality</th>
            <th>Father&apos;s Name</th>
            <th>Tel</th>
            <th>Present Address</th>
            <th>Permanent Address</th>
          </tr>
        </thead>
        <tbody>
          <RowsOrDash
            rows={d.accusedTable}
            cols={['name', 'alias', 'age', 'gender', 'nationality', 'fatherName', 'tel', 'presentAddress', 'permanentAddress']}
          />
        </tbody>
      </table>

      <div className="section-title">Victim Details</div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Alias</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Nationality</th>
            <th>Father&apos;s Name</th>
            <th>Tel</th>
            <th>Present Address</th>
            <th>Permanent Address</th>
          </tr>
        </thead>
        <tbody>
          <RowsOrDash
            rows={d.victimTable}
            cols={['name', 'alias', 'age', 'gender', 'nationality', 'fatherName', 'tel', 'presentAddress', 'permanentAddress']}
          />
        </tbody>
      </table>

      <div className="section-title">Reason for Delay</div>
      <p>{d.delayReason}</p>

      <div className="section-title">Property Details</div>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Sub Type</th>
            <th>Description</th>
            <th>Value (Rs)</th>
          </tr>
        </thead>
        <tbody>
          <RowsOrDash rows={d.propertyTable} cols={['propType', 'subType', 'description', 'value']} />
        </tbody>
      </table>
      <p>
        <strong>Total Value:</strong> Rs. {d.totalValue}
      </p>

      <div className="section-title">Inquest / UD Case</div>
      <p>
        Type: {d.inquestType} | Number: {d.inquestNo}
      </p>

      <div className="section-title">First Information Contents</div>
      <p style={{ whiteSpace: 'pre-wrap' }}>{d.narrative}</p>

      <div className="section-title">Investigating Officer</div>
      <p>
        {d.ioName} | {d.ioRank} | PEN: {d.ioPen} | Mobile: {d.ioMobile} | Age: {d.ioAge}
      </p>
    </div>
  );
}

export default function PrintPreview({ d, screen }: { d: FirFormData; screen?: boolean }) {
  return screen ? <ScreenPreview d={d} /> : <PrintDoc d={d} />;
}
