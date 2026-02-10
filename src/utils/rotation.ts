import { addDays, format, isSunday, startOfDay, differenceInDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { JenisOvertime, Pekerja } from '../types'

interface GenerateOptions {
  startDate: Date
  endDate: Date
  selectedPekerjaIds: string[]
  selectedOvertimeIds: string[]
}

export const generateRotationSchedule = async (
  options: GenerateOptions,
  jenisOvertimeList: JenisOvertime[],
  pekerjaList: Pekerja[]
) => {
  const { startDate, endDate, selectedPekerjaIds, selectedOvertimeIds } = options
  
  const schedules = []
  const days = differenceInDays(endDate, startDate) + 1
  
  // Filter selected pekerja and overtime
  const selectedPekerja = pekerjaList.filter(p => selectedPekerjaIds.includes(p.id))
  const selectedOvertime = jenisOvertimeList.filter(ot => selectedOvertimeIds.includes(ot.id))
  
  if (selectedPekerja.length === 0 || selectedOvertime.length === 0) {
    throw new Error('Pilih minimal 1 pekerja dan 1 jenis overtime')
  }

  // Distribusi pekerja ke 3 grup rotasi (MERATA)
  const grupSize = Math.ceil(selectedPekerja.length / 3)
  const grup1 = selectedPekerja.slice(0, grupSize)
  const grup2 = selectedPekerja.slice(grupSize, grupSize * 2)
  const grup3 = selectedPekerja.slice(grupSize * 2)

  const grupPekerja = [grup1, grup2, grup3]

  // Track beban kerja per pekerja untuk load balancing
  const workloadTracker: { [pekerjaId: string]: number } = {}
  selectedPekerja.forEach(p => workloadTracker[p.id] = 0)

  for (let i = 0; i < days; i++) {
    const currentDate = addDays(startOfDay(startDate), i)
    const isSundayDate = isSunday(currentDate)
    
    // Tentukan grup yang bertugas (rotasi setiap 3 hari)
    const grupIndex = Math.floor(i / 3) % 3
    const pekerjaGrup = grupPekerja[grupIndex]

    // Sort overtime by duration (descending) untuk load balancing
    const sortedOvertime = [...selectedOvertime].sort((a, b) => b.durasi_jam - a.durasi_jam)
    
    // Track pekerja yang sudah dapat tugas hari ini
    const assignedToday = new Set<string>()
    
    for (const jenisOT of sortedOvertime) {
      // Load balancing: prioritize pekerja dengan beban paling ringan
      const availablePekerja = pekerjaGrup
        .filter(p => !assignedToday.has(p.id)) // Belum dapat tugas hari ini
        .sort((a, b) => workloadTracker[a.id] - workloadTracker[b.id]) // Sort by workload (ascending)
      
      // Ambil sejumlah alokasi_pekerja
      const assignedPekerja = availablePekerja.slice(0, jenisOT.alokasi_pekerja)
      
      // Update workload tracker
      assignedPekerja.forEach(p => {
        workloadTracker[p.id] += jenisOT.durasi_jam
        assignedToday.add(p.id)
      })
      
      schedules.push({
        tanggal: format(currentDate, 'yyyy-MM-dd'),
        jenis_overtime_id: jenisOT.id,
        grup_rotasi: grupIndex + 1,
        is_minggu: isSundayDate,
        durasi_jam: jenisOT.durasi_jam,
        assigned_pekerja: assignedPekerja,
        jenis_overtime: jenisOT
      })
    }
  }

  return schedules
}

export const saveRotationSchedule = async (schedules: any[]) => {
  try {
    // Simpan rencana overtime
    for (const schedule of schedules) {
      const { assigned_pekerja, jenis_overtime, ...rencanaData } = schedule
      
      // Insert rencana
      const { data: rencana, error: rencanaError } = await supabase
        .from('rencana_overtime')
        .insert(rencanaData)
        .select()
        .single()

      if (rencanaError) {
        console.error('Error inserting rencana:', rencanaError)
        continue
      }

      // Insert pekerja yang ditugaskan
      if (assigned_pekerja && assigned_pekerja.length > 0) {
        const pekerjaRencanaData = assigned_pekerja.map((p: Pekerja) => ({
          rencana_overtime_id: rencana.id,
          pekerja_id: p.id
        }))

        const { error: pekerjaError } = await supabase
          .from('pekerja_rencana')
          .insert(pekerjaRencanaData)

        if (pekerjaError) {
          console.error('Error inserting pekerja_rencana:', pekerjaError)
        }
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error saving rotation schedule:', error)
    return { success: false, error }
  }
}

export const formatDate = (date: string | Date) => {
  return format(new Date(date), 'dd MMM yyyy')
}

export const formatDateShort = (date: string | Date) => {
  return format(new Date(date), 'dd/MM')
}

export const getDayName = (date: string | Date) => {
  return format(new Date(date), 'EEEE')
}