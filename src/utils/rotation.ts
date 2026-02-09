import { addDays, format, isSunday, startOfDay } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { JenisOvertime, Pekerja } from '../types'

export const generateRotationSchedule = async (
  startDate: Date,
  days: number = 15,
  jenisOvertimeList: JenisOvertime[],
  pekerjaList: Pekerja[]
) => {
  const schedules = []
  const aktifPekerja = pekerjaList.filter(p => p.aktif)
  
  // Distribusi pekerja ke 3 grup rotasi
  const pekerjaPerGrup = Math.ceil(aktifPekerja.length / 3)
  const grup1 = aktifPekerja.slice(0, pekerjaPerGrup)
  const grup2 = aktifPekerja.slice(pekerjaPerGrup, pekerjaPerGrup * 2)
  const grup3 = aktifPekerja.slice(pekerjaPerGrup * 2)

  const grupPekerja = [grup1, grup2, grup3]

  for (let i = 0; i < days; i++) {
    const currentDate = addDays(startOfDay(startDate), i)
    const isSundayDate = isSunday(currentDate)
    
    // Tentukan grup yang bertugas (rotasi setiap 3 hari)
    const grupIndex = Math.floor(i / 3) % 3
    
    for (const jenisOT of jenisOvertimeList) {
      const pekerjaGrup = grupPekerja[grupIndex]
      const assignedPekerja = pekerjaGrup.slice(0, jenisOT.alokasi_pekerja)
      
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
