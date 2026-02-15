import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { getDayName } from './rotation'

interface ScheduleData {
  [pekerjaId: string]: {
    nama: string
    schedule: {
      [tanggal: string]: {
        jenis: string
        durasi: number
        grup: number
      }[]
    }
  }
}

export function exportToPDF(
  scheduleData: ScheduleData,
  dates: Date[],
  pekerjaList: any[],
  selectedPekerjaFilter: string[],
  selectedOvertimeFilter: string[]
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  })

  // Filter data
  const filteredPekerja = pekerjaList.filter(p => selectedPekerjaFilter.includes(p.id))

  // Title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Jadwal Overtime', 14, 15)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Periode: ${format(dates[0], 'dd/MM/yyyy')} - ${format(dates[dates.length - 1], 'dd/MM/yyyy')}`, 14, 22)
  doc.text(`Dicetak: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 27)

  // Prepare table data
  const headers = ['Pekerja', ...dates.map(d => `${getDayName(format(d, 'yyyy-MM-dd')).substring(0, 3)}\n${format(d, 'dd/MM')}`)]
  
  const rows = filteredPekerja
    .map(pekerja => {
      const workerSchedule = scheduleData[pekerja.id]
      if (!workerSchedule) return null
      
      const row = [pekerja.nama]
      let hasAnySchedule = false
      
      dates.forEach(date => {
        const tanggal = format(date, 'yyyy-MM-dd')
        const daySchedule = workerSchedule.schedule[tanggal] || []
        
        // Apply overtime filter
        const filteredSchedule = selectedOvertimeFilter.length > 0
          ? daySchedule.filter(item => selectedOvertimeFilter.includes(item.jenis))
          : daySchedule
        
        if (filteredSchedule.length === 0) {
          row.push('-')
        } else {
          hasAnySchedule = true
          const text = filteredSchedule.map(s => `${s.jenis} (${s.durasi}j)`).join('\n')
          row.push(text)
        }
      })
      
      // Hanya return row jika pekerja punya minimal 1 jadwal
      return hasAnySchedule ? row : null
    })
    .filter(row => row !== null) // Filter out null rows

  // Generate table
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 32,
    theme: 'grid',
    styles: {
      fontSize: 10,
      cellPadding: 2,
      valign: 'middle',
      halign: 'center'
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 30, fontSize:9 , fontStyle:'bold'}
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    }
  })

  // Save
  doc.save(`jadwal-overtime-${format(new Date(), 'yyyyMMdd')}.pdf`)
}

export function exportToExcel(
  scheduleData: ScheduleData,
  dates: Date[],
  pekerjaList: any[],
  selectedPekerjaFilter: string[],
  selectedOvertimeFilter: string[]
) {
  // Filter data
  const filteredPekerja = pekerjaList.filter(p => selectedPekerjaFilter.includes(p.id))

  // Prepare data
  const data: any[] = []
  
  // Header row
  const header = ['Pekerja', 'NIK', ...dates.map(d => `${getDayName(format(d, 'yyyy-MM-dd'))} ${format(d, 'dd/MM')}`)]
  data.push(header)
  
  // Data rows - hanya pekerja yang punya jadwal
  filteredPekerja.forEach(pekerja => {
    const workerSchedule = scheduleData[pekerja.id]
    if (!workerSchedule) return
    
    const row = [pekerja.nama, pekerja.nik || '']
    let hasAnySchedule = false
    
    dates.forEach(date => {
      const tanggal = format(date, 'yyyy-MM-dd')
      const daySchedule = workerSchedule.schedule[tanggal] || []
      
      // Apply overtime filter
      const filteredSchedule = selectedOvertimeFilter.length > 0
        ? daySchedule.filter(item => selectedOvertimeFilter.includes(item.jenis))
        : daySchedule
      
      if (filteredSchedule.length === 0) {
        row.push('-')
      } else {
        hasAnySchedule = true
        const text = filteredSchedule.map(s => `${s.jenis} (${s.durasi}j, G${s.grup})`).join('; ')
        row.push(text)
      }
    })
    
    // Hanya push row jika pekerja punya minimal 1 jadwal
    if (hasAnySchedule) {
      data.push(row)
    }
  })

  // Create workbook
  const ws = XLSX.utils.aoa_to_sheet(data)
  
  // Set column widths
  const colWidths = [{ wch: 20 }, { wch: 15 }, ...dates.map(() => ({ wch: 18 }))]
  ws['!cols'] = colWidths
  
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Jadwal Overtime')
  
  // Save
  XLSX.writeFile(wb, `jadwal-overtime-${format(new Date(), 'yyyyMMdd')}.xlsx`)
}
