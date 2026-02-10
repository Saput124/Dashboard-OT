import { useState, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { addDays, format, startOfDay, differenceInDays } from 'date-fns'

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

export default function Dashboard() {
  const [scheduleData, setScheduleData] = useState<ScheduleData>({})
  const [startDate, setStartDate] = useState(new Date())
  const [endDate, setEndDate] = useState(addDays(new Date(), 14))
  const [loading, setLoading] = useState(true)
  const [pekerjaList, setPekerjaList] = useState<any[]>([])

  const totalDays = differenceInDays(endDate, startDate) + 1
  const dates = Array.from({ length: totalDays }, (_, i) => addDays(startOfDay(startDate), i))

  useEffect(() => {
    fetchScheduleBoard()
  }, [startDate, endDate])

  const fetchScheduleBoard = async () => {
    setLoading(true)
    
    // Fetch all pekerja
    const { data: pekerja } = await supabase
      .from('pekerja')
      .select('*')
      .eq('aktif', true)
      .order('nama', { ascending: true })

    if (!pekerja) {
      setLoading(false)
      return
    }

    setPekerjaList(pekerja)

    // Fetch rencana for date range
    const { data: rencanaData } = await supabase
      .from('rencana_overtime')
      .select(`
        *,
        jenis_overtime (nama, durasi_jam),
        pekerja_rencana (pekerja_id)
      `)
      .gte('tanggal', format(startDate, 'yyyy-MM-dd'))
      .lte('tanggal', format(endDate, 'yyyy-MM-dd'))
      .order('tanggal', { ascending: true })

    // Fetch aktual data
    const { data: aktualData } = await supabase
      .from('aktual_overtime')
      .select('*')
      .gte('tanggal', format(startDate, 'yyyy-MM-dd'))
      .lte('tanggal', format(endDate, 'yyyy-MM-dd'))

    // Build schedule data structure
    const schedule: ScheduleData = {}
    
    pekerja.forEach(p => {
      schedule[p.id] = {
        nama: p.nama,
        schedule: {}
      }
    })

    // Fill in rencana data
    rencanaData?.forEach(rencana => {
      const tanggal = rencana.tanggal
      const pekerjaIds = rencana.pekerja_rencana?.map((pr: any) => pr.pekerja_id) || []
      
      pekerjaIds.forEach((pekerjaId: string) => {
        if (schedule[pekerjaId]) {
          if (!schedule[pekerjaId].schedule[tanggal]) {
            schedule[pekerjaId].schedule[tanggal] = []
          }
          
          // Check if this pekerja has aktual for this rencana
          const aktual = aktualData?.find(a => 
            a.rencana_overtime_id === rencana.id && 
            a.pekerja_id === pekerjaId
          )
          
          schedule[pekerjaId].schedule[tanggal].push({
            jenis: rencana.jenis_overtime?.nama || '',
            durasi: rencana.durasi_jam,
            grup: rencana.grup_rotasi,
            hasActual: !!aktual,
            dilaksanakan: aktual?.dilaksanakan
          })
        }
      })
    })

    setScheduleData(schedule)
    setLoading(false)
  }

  const handlePrevWeek = () => {
    const days = differenceInDays(endDate, startDate) + 1
    setStartDate(prev => addDays(prev, -days))
    setEndDate(prev => addDays(prev, -days))
  }

  const handleNextWeek = () => {
    const days = differenceInDays(endDate, startDate) + 1
    setStartDate(prev => addDays(prev, days))
    setEndDate(prev => addDays(prev, days))
  }

  const handleToday = () => {
    const days = differenceInDays(endDate, startDate)
    setStartDate(new Date())
    setEndDate(addDays(new Date(), days))
  }

  const handleDateRangeChange = (start: string, end: string) => {
    if (start) setStartDate(new Date(start))
    if (end) setEndDate(new Date(end))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-600">Memuat papan jadwal...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Calendar className="w-7 h-7" />
          Papan Jadwal Overtime
        </h2>
        <p className="text-gray-600">Jadwal rotasi lembur (pilih periode sesuai kebutuhan)</p>
      </div>

      {/* Date Navigation & Range Selector */}
      <div className="card">
        <div className="space-y-4">
          {/* Date Range Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="label text-xs">Tanggal Mulai</label>
              <input
                type="date"
                value={format(startDate, 'yyyy-MM-dd')}
                onChange={(e) => handleDateRangeChange(e.target.value, format(endDate, 'yyyy-MM-dd'))}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="label text-xs">Tanggal Selesai</label>
              <input
                type="date"
                value={format(endDate, 'yyyy-MM-dd')}
                onChange={(e) => handleDateRangeChange(format(startDate, 'yyyy-MM-dd'), e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="label text-xs">Total Hari</label>
              <div className="input-field bg-blue-50 text-center font-semibold text-blue-700 text-sm">
                {totalDays} hari
              </div>
            </div>
            <div className="flex items-end">
              <button onClick={handleToday} className="btn-primary w-full">
                Hari Ini
              </button>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-center gap-3">
            <button onClick={handlePrevWeek} className="btn-secondary p-2">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center px-4">
              <p className="text-sm font-semibold text-gray-700">
                {format(startDate, 'dd MMM yyyy')} - {format(endDate, 'dd MMM yyyy')}
              </p>
            </div>
            <button onClick={handleNextWeek} className="btn-secondary p-2">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                setStartDate(new Date())
                setEndDate(addDays(new Date(), 6))
              }}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
            >
              7 Hari
            </button>
            <button
              onClick={() => {
                setStartDate(new Date())
                setEndDate(addDays(new Date(), 13))
              }}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
            >
              14 Hari
            </button>
            <button
              onClick={() => {
                setStartDate(new Date())
                setEndDate(addDays(new Date(), 29))
              }}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
            >
              30 Hari
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="card bg-blue-50 border border-blue-200">
        <h3 className="font-semibold mb-3 text-blue-900">Keterangan:</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span>Sudah input & hadir</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded"></div>
            <span>Belum input aktual</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
            <span>Tidak hadir</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded"></div>
            <span>Tidak ada tugas</span>
          </div>
        </div>
        <p className="text-xs text-blue-700 mt-3">
          💡 Tip: Gunakan preset (7/14/30 hari) atau pilih custom date range untuk melihat periode tertentu
        </p>
      </div>

      {/* Schedule Board */}
      <div className="card overflow-x-auto">
        <div className="min-w-max">
          {/* Header Row - Dates */}
          <div className="flex border-b-2 border-gray-300 bg-gray-50">
            <div className="w-48 flex-shrink-0 p-3 font-semibold border-r-2 border-gray-300 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Pekerja ({pekerjaList.length})
            </div>
            {dates.map((date, i) => {
              const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
              const isWeekend = date.getDay() === 0 || date.getDay() === 6
              return (
                <div 
                  key={i} 
                  className={`w-32 flex-shrink-0 p-2 text-center border-r border-gray-200 ${
                    isToday ? 'bg-blue-100 font-bold' : ''
                  } ${isWeekend ? 'bg-yellow-50' : ''}`}
                >
                  <div className="text-xs font-semibold">{format(date, 'EEE')}</div>
                  <div className={`text-sm ${isToday ? 'text-blue-700' : ''}`}>
                    {format(date, 'dd/MM')}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Data Rows - Workers */}
          {pekerjaList.map((pekerja) => {
            const workerSchedule = scheduleData[pekerja.id]
            if (!workerSchedule) return null

            return (
              <div key={pekerja.id} className="flex border-b border-gray-200 hover:bg-gray-50">
                <div className="w-48 flex-shrink-0 p-3 font-medium border-r-2 border-gray-300 bg-white">
                  <div className="text-sm truncate" title={pekerja.nama}>
                    {pekerja.nama}
                  </div>
                  <div className="text-xs text-gray-500">{pekerja.nik}</div>
                </div>
                {dates.map((date, i) => {
                  const tanggal = format(date, 'yyyy-MM-dd')
                  const daySchedule = workerSchedule.schedule[tanggal] || []
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6

                  return (
                    <div 
                      key={i} 
                      className={`w-32 flex-shrink-0 p-1 border-r border-gray-200 ${
                        isWeekend ? 'bg-yellow-50' : 'bg-white'
                      }`}
                    >
                      {daySchedule.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                          <div className="w-full h-8 bg-gray-100 rounded border border-gray-200"></div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {daySchedule.map((item, idx) => {
                            let bgColor = 'bg-orange-100 border-orange-300'
                            if (item.hasActual) {
                              bgColor = item.dilaksanakan 
                                ? 'bg-green-100 border-green-300' 
                                : 'bg-red-100 border-red-300'
                            }
                            
                            return (
                              <div 
                                key={idx}
                                className={`text-xs p-1 rounded border ${bgColor}`}
                                title={`${item.jenis} - ${item.durasi}jam - Grup ${item.grup}`}
                              >
                                <div className="font-semibold truncate">{item.jenis}</div>
                                <div className="text-[10px] flex justify-between">
                                  <span>{item.durasi}j</span>
                                  <span>G{item.grup}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {pekerjaList.length === 0 && (
        <div className="card text-center py-8 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>Tidak ada data pekerja</p>
          <p className="text-sm">Tambahkan pekerja di menu Management</p>
        </div>
      )}
    </div>
  )
}