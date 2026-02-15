import { format } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

interface ScheduleData {
  [pekerjaId: string]: {
    nama: string
    schedule: {
      [tanggal: string]: {
        jenis: string
        durasi: number
        grup: number
        hasActual?: boolean
        dilaksanakan?: boolean
      }[]
    }
  }
}

/**
 * Export dashboard data to PDF
 */
export const exportToPDF = (
  scheduleData: ScheduleData,
  dates: Date[],
  pekerjaList: any[],
  filterPekerjaIds: string[],
  filterJenisOTIds: string[],
  jenisOvertimeList: any[]
) => {
  const doc = new jsPDF('landscape')
  
  // Title
  doc.setFontSize(16)
  doc.text('Laporan Overtime', 14, 15)
  
  doc.setFontSize(10)
  doc.text(`Periode: ${format(dates[0], 'dd/MM/yyyy')} - ${format(dates[dates.length - 1], 'dd/MM/yyyy')}`, 14, 22)
  doc.text(`Dicetak: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 27)
  
  // Build table data
  const headers = [
    'No',
    'Nama Pekerja',
    ...dates.map(d => format(d, 'dd/MM')),
    'Total Jam'
  ]
  
  const filteredPekerja = pekerjaList.filter(p => 
    filterPekerjaIds.length === 0 || filterPekerjaIds.includes(p.id)
  )
  
  const rows = filteredPekerja.map((pekerja, index) => {
    const workerSchedule = scheduleData[pekerja.id]
    if (!workerSchedule) return null
    
    const row = [index + 1, pekerja.nama]
    let totalJam = 0
    
    dates.forEach(date => {
      const tanggal = format(date, 'yyyy-MM-dd')
      const daySchedule = (workerSchedule.schedule[tanggal] || [])
        .filter(item => {
          if (filterJenisOTIds.length === 0) return true
          const jenisOTId = jenisOvertimeList.find(ot => ot.nama === item.jenis)?.id
          return jenisOTId && filterJenisOTIds.includes(jenisOTId)
        })
      
      if (daySchedule.length === 0) {
        row.push('-')
      } else if (daySchedule.length === 1) {
        const item = daySchedule[0]
        row.push(`${item.jenis} (${item.durasi}j)`)
        totalJam += item.durasi
      } else {
        const total = daySchedule.reduce((sum, item) => sum + item.durasi, 0)
        row.push(`${daySchedule.length} OT (${total}j)`)
        totalJam += total
      }
    })
    
    row.push(`${totalJam}j`)
    return row
  }).filter(Boolean)
  
  // Add table
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 32,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 10, right: 10 }
  })
  
  // Save
  const filename = `overtime-${format(dates[0], 'yyyy-MM-dd')}-${format(dates[dates.length - 1], 'yyyy-MM-dd')}.pdf`
  doc.save(filename)
}

/**
 * Export dashboard data to Excel
 */
export const exportToExcel = (
  scheduleData: ScheduleData,
  dates: Date[],
  pekerjaList: any[],
  filterPekerjaIds: string[],
  filterJenisOTIds: string[],
  jenisOvertimeList: any[]
) => {
  // Build data for Excel
  const headers = [
    'No',
    'Nama Pekerja',
    'NIK',
    ...dates.map(d => format(d, 'dd/MM')),
    'Total Rencana (Jam)',
    'Total Aktual (Jam)',
    '% Kehadiran'
  ]
  
  const filteredPekerja = pekerjaList.filter(p => 
    filterPekerjaIds.length === 0 || filterPekerjaIds.includes(p.id)
  )
  
  const rows = filteredPekerja.map((pekerja, index) => {
    const workerSchedule = scheduleData[pekerja.id]
    if (!workerSchedule) return null
    
    const row: any[] = [index + 1, pekerja.nama, pekerja.nik]
    let totalRencana = 0
    let totalAktual = 0
    
    dates.forEach(date => {
      const tanggal = format(date, 'yyyy-MM-dd')
      const daySchedule = (workerSchedule.schedule[tanggal] || [])
        .filter(item => {
          if (filterJenisOTIds.length === 0) return true
          const jenisOTId = jenisOvertimeList.find(ot => ot.nama === item.jenis)?.id
          return jenisOTId && filterJenisOTIds.includes(jenisOTId)
        })
      
      if (daySchedule.length === 0) {
        row.push('-')
      } else if (daySchedule.length === 1) {
        const item = daySchedule[0]
        row.push(`${item.jenis} (${item.durasi}j)`)
        totalRencana += item.durasi
        if (item.hasActual && item.dilaksanakan) {
          totalAktual += item.durasi
        }
      } else {
        const total = daySchedule.reduce((sum, item) => sum + item.durasi, 0)
        row.push(`${daySchedule.length} OT (${total}j)`)
        totalRencana += total
        daySchedule.forEach(item => {
          if (item.hasActual && item.dilaksanakan) {
            totalAktual += item.durasi
          }
        })
      }
    })
    
    row.push(totalRencana)
    row.push(totalAktual)
    row.push(totalRencana > 0 ? Math.round((totalAktual / totalRencana) * 100) + '%' : '0%')
    
    return row
  }).filter(Boolean)
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  
  // Set column widths
  ws['!cols'] = [
    { wch: 5 },  // No
    { wch: 20 }, // Nama
    { wch: 15 }, // NIK
    ...dates.map(() => ({ wch: 15 })), // Dates
    { wch: 12 }, // Total Rencana
    { wch: 12 }, // Total Aktual
    { wch: 12 }  // %
  ]
  
  // Create workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Overtime')
  
  // Save
  const filename = `overtime-${format(dates[0], 'yyyy-MM-dd')}-${format(dates[dates.length - 1], 'yyyy-MM-dd')}.xlsx`
  XLSX.writeFile(wb, filename)
}
