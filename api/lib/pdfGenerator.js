import PDFDocument from 'pdfkit';

/**
 * Color palettes for Executive-grade documents
 */
export const PALETTES = {
  navy: {
    primary: '#0F172A',     // Slate 900
    secondary: '#1E293B',   // Slate 800
    accent: '#2563EB',      // Blue 600
    accentLight: '#EFF6FF', // Blue 50
    surface: '#F8FAFC',     // Slate 50
    border: '#E2E8F0',      // Slate 200
    text: '#334155',        // Slate 700
    textDark: '#0F172A',    // Slate 900
    textMuted: '#64748B',   // Slate 500
    tableHeaderBg: '#1E293B',
    tableHeaderText: '#FFFFFF',
    tableRowAlt: '#F8FAFC',
  },
  emerald: {
    primary: '#064E3B',     // Emerald 900
    secondary: '#065F46',   // Emerald 800
    accent: '#059669',      // Emerald 600
    accentLight: '#ECFDF5', // Emerald 50
    surface: '#F9FAFB',
    border: '#D1FAE5',
    text: '#374151',
    textDark: '#064E3B',
    textMuted: '#6B7280',
    tableHeaderBg: '#065F46',
    tableHeaderText: '#FFFFFF',
    tableRowAlt: '#F0FDF4',
  },
  charcoal: {
    primary: '#18181B',     // Zinc 900
    secondary: '#27272A',   // Zinc 800
    accent: '#4F46E5',      // Indigo 600
    accentLight: '#EEF2FF', // Indigo 50
    surface: '#FAFAFA',
    border: '#E4E4E7',
    text: '#3F3F46',
    textDark: '#18181B',
    textMuted: '#71717A',
    tableHeaderBg: '#27272A',
    tableHeaderText: '#FFFFFF',
    tableRowAlt: '#F4F4F5',
  },
};

/**
 * Generates an executive PDF buffer from structured document sections
 *
 * @param {Object} options
 * @param {string} options.title - Document title
 * @param {string} [options.subtitle] - Document subtitle / description
 * @param {string} [options.author] - Author / prepared by (e.g. "Quantum AI Workspace")
 * @param {string} [options.date] - Document date
 * @param {string} [options.statusBadge] - Pill badge (e.g. "EXECUTIVE SUMMARY", "CONFIDENTIAL", "FINAL")
 * @param {string} [options.theme='navy'] - 'navy' | 'emerald' | 'charcoal'
 * @param {Array<{label: string, value: string, change?: string}>} [options.metrics] - Key metrics cards
 * @param {string} [options.summaryBox] - Highlight / executive summary callout text
 * @param {Array<{title: string, content?: string, bullets?: string[], table?: {headers: string[], rows: string[][]}}>} options.sections
 * @returns {Promise<Buffer>}
 */
export async function generateExecutivePdf({
  title = 'Executive Report',
  subtitle = '',
  author = 'Quantum AI Workspace',
  date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  statusBadge = 'CONFIDENTIAL',
  theme = 'navy',
  metrics = [],
  summaryBox = '',
  sections = [],
}) {
  const palette = PALETTES[theme] || PALETTES.navy;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      bufferPages: true,
      autoFirstPage: true,
    });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer);
    });
    doc.on('error', (err) => reject(err));

    const contentWidth = doc.page.width - 96; // 48 margin on each side
    let currentY = 48;

    // Helper: ensure space or add new page
    function checkPageBreak(requiredHeight) {
      if (doc.y + requiredHeight > doc.page.height - 60) {
        doc.addPage();
        currentY = 48;
        return true;
      }
      return false;
    }

    // --- 1. HEADER BANNER ---
    doc.rect(48, currentY, contentWidth, 4).fill(palette.accent);
    currentY += 14;
    doc.y = currentY;

    // Status Badge & Date
    if (statusBadge) {
      doc.save();
      doc.roundedRect(48, currentY, 110, 18, 3).fill(palette.accentLight);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(palette.accent).text(statusBadge.toUpperCase(), 54, currentY + 4, {
        width: 98,
        align: 'center',
      });
      doc.restore();
    }

    doc.font('Helvetica').fontSize(9).fillColor(palette.textMuted).text(date, 48, currentY + 4, {
      width: contentWidth,
      align: 'right',
    });

    currentY += 28;
    doc.y = currentY;

    // Title
    doc.font('Helvetica-Bold').fontSize(24).fillColor(palette.primary).text(title, 48, currentY, {
      width: contentWidth,
      lineGap: 4,
    });
    currentY = doc.y + 6;

    // Subtitle
    if (subtitle) {
      doc.font('Helvetica').fontSize(12).fillColor(palette.textMuted).text(subtitle, 48, currentY, {
        width: contentWidth,
        lineGap: 2,
      });
      currentY = doc.y + 8;
    }

    // Author metadata
    if (author) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(palette.textMuted).text(`Prepared by: ${author}`, 48, currentY);
      currentY = doc.y + 16;
    }

    // Divider Line
    doc.moveTo(48, currentY).lineTo(48 + contentWidth, currentY).strokeColor(palette.border).lineWidth(1).stroke();
    currentY += 16;
    doc.y = currentY;

    // --- 2. SUMMARY / CALLOUT BOX ---
    if (summaryBox) {
      const boxText = String(summaryBox).trim();
      doc.font('Helvetica').fontSize(10);
      const textHeight = doc.heightOfString(boxText, { width: contentWidth - 32, lineGap: 3 });
      const boxHeight = textHeight + 20;

      checkPageBreak(boxHeight + 10);
      currentY = doc.y;

      doc.save();
      // Background
      doc.roundedRect(48, currentY, contentWidth, boxHeight, 4).fill(palette.surface);
      // Left accent stripe
      doc.roundedRect(48, currentY, 4, boxHeight, 2).fill(palette.accent);
      // Text
      doc.font('Helvetica').fontSize(10).fillColor(palette.textDark).text(boxText, 64, currentY + 10, {
        width: contentWidth - 32,
        lineGap: 3,
      });
      doc.restore();

      currentY += boxHeight + 16;
      doc.y = currentY;
    }

    // --- 3. METRICS / KPI CARDS ---
    if (Array.isArray(metrics) && metrics.length > 0) {
      checkPageBreak(70);
      currentY = doc.y;

      const cardCount = Math.min(4, metrics.length);
      const gap = 12;
      const cardWidth = (contentWidth - (cardCount - 1) * gap) / cardCount;
      const cardHeight = 58;

      metrics.slice(0, 4).forEach((metric, idx) => {
        const cardX = 48 + idx * (cardWidth + gap);

        doc.save();
        // Card Box
        doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 4).fillAndStroke(palette.surface, palette.border);

        // Value
        doc.font('Helvetica-Bold').fontSize(16).fillColor(palette.primary).text(String(metric.value || ''), cardX + 10, currentY + 10, {
          width: cardWidth - 20,
          ellipsis: true,
        });

        // Label
        doc.font('Helvetica').fontSize(8.5).fillColor(palette.textMuted).text(String(metric.label || '').toUpperCase(), cardX + 10, currentY + 34, {
          width: cardWidth - 20,
          ellipsis: true,
        });

        doc.restore();
      });

      currentY += cardHeight + 20;
      doc.y = currentY;
    }

    // --- 4. SECTIONS ---
    for (const section of sections) {
      checkPageBreak(60);
      currentY = doc.y;

      // Section Title
      if (section.title) {
        doc.font('Helvetica-Bold').fontSize(13).fillColor(palette.secondary).text(section.title, 48, currentY, {
          width: contentWidth,
        });
        currentY = doc.y + 4;
        doc.moveTo(48, currentY).lineTo(48 + contentWidth, currentY).strokeColor(palette.border).lineWidth(0.75).stroke();
        currentY += 8;
        doc.y = currentY;
      }

      // Paragraph Content
      if (section.content) {
        const lines = String(section.content).split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            currentY += 6;
            doc.y = currentY;
            continue;
          }
          checkPageBreak(25);
          doc.font('Helvetica').fontSize(10).fillColor(palette.text).text(trimmed, 48, doc.y, {
            width: contentWidth,
            lineGap: 3,
          });
          currentY = doc.y + 4;
        }
      }

      // Bullets
      if (Array.isArray(section.bullets) && section.bullets.length > 0) {
        for (const bullet of section.bullets) {
          checkPageBreak(20);
          const bulletY = doc.y;
          // Bullet dot
          doc.circle(54, bulletY + 5, 2.5).fill(palette.accent);
          // Text
          doc.font('Helvetica').fontSize(10).fillColor(palette.text).text(String(bullet), 66, bulletY, {
            width: contentWidth - 18,
            lineGap: 2,
          });
          currentY = doc.y + 4;
        }
        currentY += 6;
        doc.y = currentY;
      }

      // Tables
      if (section.table && Array.isArray(section.table.headers) && Array.isArray(section.table.rows)) {
        const { headers, rows } = section.table;
        const colCount = headers.length;
        if (colCount > 0) {
          const colWidth = contentWidth / colCount;
          const rowHeight = 22;

          checkPageBreak(rowHeight * 2 + 10);
          let tableY = doc.y + 4;

          // Header Row
          doc.save();
          doc.rect(48, tableY, contentWidth, rowHeight).fill(palette.tableHeaderBg);
          headers.forEach((header, colIdx) => {
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(palette.tableHeaderText).text(
              String(header).toUpperCase(),
              48 + colIdx * colWidth + 6,
              tableY + 6,
              { width: colWidth - 12, ellipsis: true }
            );
          });
          doc.restore();
          tableY += rowHeight;

          // Data Rows
          rows.forEach((row, rowIdx) => {
            if (tableY + rowHeight > doc.page.height - 60) {
              doc.addPage();
              tableY = 48;
              // Re-draw header on new page
              doc.save();
              doc.rect(48, tableY, contentWidth, rowHeight).fill(palette.tableHeaderBg);
              headers.forEach((header, colIdx) => {
                doc.font('Helvetica-Bold').fontSize(8.5).fillColor(palette.tableHeaderText).text(
                  String(header).toUpperCase(),
                  48 + colIdx * colWidth + 6,
                  tableY + 6,
                  { width: colWidth - 12, ellipsis: true }
                );
              });
              doc.restore();
              tableY += rowHeight;
            }

            const isAlt = rowIdx % 2 === 1;
            doc.save();
            if (isAlt) {
              doc.rect(48, tableY, contentWidth, rowHeight).fill(palette.tableRowAlt);
            }
            doc.rect(48, tableY, contentWidth, rowHeight).strokeColor(palette.border).lineWidth(0.5).stroke();

            (row || []).forEach((cell, colIdx) => {
              if (colIdx >= colCount) return;
              doc.font('Helvetica').fontSize(9).fillColor(palette.textDark).text(
                String(cell ?? ''),
                48 + colIdx * colWidth + 6,
                tableY + 6,
                { width: colWidth - 12, ellipsis: true }
              );
            });
            doc.restore();
            tableY += rowHeight;
          });

          currentY = tableY + 12;
          doc.y = currentY;
        }
      }

      currentY += 8;
      doc.y = currentY;
    }

    // --- 5. FOOTERS & PAGE NUMBERS (Run across all pages) ---
    const pageRange = doc.bufferedPageRange();
    const totalPages = pageRange.count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      // Running Header (Pages 2+)
      if (i > 0) {
        doc.save();
        doc.font('Helvetica').fontSize(8).fillColor(palette.textMuted).text(title, 48, 26, {
          width: contentWidth,
          align: 'left',
        });
        doc.moveTo(48, 38).lineTo(48 + contentWidth, 38).strokeColor(palette.border).lineWidth(0.5).stroke();
        doc.restore();
      }

      // Footer (All Pages)
      const footerY = doc.page.height - 36;
      doc.save();
      doc.moveTo(48, footerY - 6).lineTo(48 + contentWidth, footerY - 6).strokeColor(palette.border).lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(palette.textMuted).text('CONFIDENTIAL • GENERATED BY QUANTUM AI', 48, footerY, {
        width: contentWidth / 2,
        align: 'left',
      });
      doc.font('Helvetica').fontSize(8).fillColor(palette.textMuted).text(`Page ${i + 1} of ${totalPages}`, 48 + contentWidth / 2, footerY, {
        width: contentWidth / 2,
        align: 'right',
      });
      doc.restore();
    }

    doc.end();
  });
}
