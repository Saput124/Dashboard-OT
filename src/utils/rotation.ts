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
  const assignmentCount: { [pekerjaId: string]: number } = {}
  selectedPekerja.forEach(p => {
    workloadTracker[p.id] = 0
    assignmentCount[p.id] = 0
  })

  // Track rotasi day counter (HANYA HARI KERJA - SKIP MINGGU!)
  let workdayCounter = 0

  for (let i = 0; i < days; i++) {
    const currentDate = addDays(startOfDay(startDate), i)
    const isSundayDate = isSunday(currentDate)
    
    // SKIP HARI MINGGU dari assignment
    if (isSundayDate) {
      continue // Tidak ada assignment untuk hari Minggu
    }
    
    // Tentukan grup yang bertugas (rotasi setiap 3 HARI KERJA)
    const grupIndex = Math.floor(workdayCounter / 3) % 3
    workdayCounter++ // Increment hanya untuk hari kerja
    
    // Sort overtime by duration (descending) untuk load balancing
    const sortedOvertime = [...selectedOvertime].sort((a, b) => b.durasi_jam - a.durasi_jam)
    
    // Track pekerja yang sudah dapat tugas hari ini
    const assignedToday = new Set<string>()
    
    for (const jenisOT of sortedOvertime) {
      let availablePekerja: Pekerja[]
      
      if (jenisOT.alokasi_pekerja > grupPekerja[grupIndex].length) {
        // CROSS-GROUP: Alokasi > grup size
        const primaryGrup = grupPekerja[grupIndex]
        const otherGrups = grupPekerja.filter((_, idx) => idx !== grupIndex).flat()
        
        availablePekerja = [...primaryGrup, ...otherGrups]
          .filter(p => !assignedToday.has(p.id))
          .sort((a, b) => {
            // Prioritas 1: Grup utama
            const aPrimary = primaryGrup.includes(a) ? 0 : 1
            const bPrimary = primaryGrup.includes(b) ? 0 : 1
            if (aPrimary !== bPrimary) return aPrimary - bPrimary
            
            // Prioritas 2: Assignment count (yang paling jarang dapat)
            if (assignmentCount[a.id] !== assignmentCount[b.id]) {
              return assignmentCount[a.id] - assignmentCount[b.id]
            }
            
            // Prioritas 3: Workload (jam paling sedikit)
            return workloadTracker[a.id] - workloadTracker[b.id]
          })
      } else {
        // NORMAL: Ambil dari grup yang bertugas
        availablePekerja = grupPekerja[grupIndex]
          .filter(p => !assignedToday.has(p.id))
          .sort((a, b) => {
            // Prioritas assignment count dulu, baru workload
            if (assignmentCount[a.id] !== assignmentCount[b.id]) {
              return assignmentCount[a.id] - assignmentCount[b.id]
            }
            return workloadTracker[a.id] - workloadTracker[b.id]
          })
      }
      
      // Ambil sejumlah alokasi_pekerja
      const assignedPekerja = availablePekerja.slice(0, jenisOT.alokasi_pekerja)
      
      // Update trackers
      assignedPekerja.forEach(p => {
        workloadTracker[p.id] += jenisOT.durasi_jam
        assignmentCount[p.id] += 1 // Count berapa kali dapat tugas
        assignedToday.add(p.id)
      })
      
      schedules.push({
        tanggal: format(currentDate, 'yyyy-MM-dd'),
        jenis_overtime_id: jenisOT.id,
        grup_rotasi: grupIndex + 1,
        is_minggu: false, // Sudah di-skip, pasti bukan Minggu
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