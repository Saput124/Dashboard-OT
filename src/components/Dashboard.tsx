import { useState, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Users, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { addDays, format, startOfDay, differenceInDays } from 'date-fns'
import { exportToPDF, exportToExcel } from '../utils/export'

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
  const [jenisOvertimeList, setJenisOvertimeList] = useState<any[]>([])
  const [filterPekerjaIds, setFilterPekerjaIds] = useState<string[]>([]) // Multi-select
  const [filterJenisOTIds, setFilterJenisOTIds] = useState<string[]>([]) // Multi-select

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

    // Fetch jenis overtime untuk filter
    const { data: jenisOT } = await supabase
      .from('jenis_overtime')
      .select('*')
      .order('nama', { ascending: true })

    if (!pekerja) {
      setLoading(false)
      return
    }

    setPekerjaList(pekerja)
    if (jenisOT) setJenisOvertimeList(jenisOT)

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
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <Calendar className="w-7 h-7" />
            Papan Jadwal Overtime
          </h2>
          <p className="text-gray-600">Jadwal rotasi lembur (pilih periode sesuai kebutuhan)</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToPDF(scheduleData, dates, pekerjaList, filterPekerjaIds, filterJenisOTIds, jenisOvertimeList)}
            className="btn-secondary flex items-center gap-2"
            title="Download PDF"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
          <button
            onClick={() => exportToExcel(scheduleData, dates, pekerjaList, filterPekerjaIds, filterJenisOTIds, jenisOvertimeList)}
            className="btn-secondary flex items-center gap-2"
            title="Download Excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>

      {/* Date Navigation & Range Selector */}
      <div className="card">
        <div className="space-y-4">
          {/* Filter Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label text-xs">Filter Pekerja</label>
                <button
                  onClick={() => {
                    if (filterPekerjaIds.length === pekerjaList.length) {
                      setFilterPekerjaIds([])
                    } else {
                      setFilterPekerjaIds(pekerjaList.map(p => p.id))
                    }
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {filterPekerjaIds.length === pekerjaList.length ? 'Clear All' : 'Select All'}
                </button>
              </div>
              <div className="border border-gray-300 rounded max-h-40 overflow-y-auto p-2 bg-white">
                {pekerjaList.map(p => (
                  <label key={p.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterPekerjaIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilterPekerjaIds([...filterPekerjaIds, p.id])
                        } else {
                          setFilterPekerjaIds(filterPekerjaIds.filter(id => id !== p.id))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{p.nama}</span>
                  </label>
                ))}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {filterPekerjaIds.length === 0 ? 'Semua pekerja' : `${filterPekerjaIds.length} dipilih`}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label text-xs">Filter Jenis Overtime</label>
                <button
                  onClick={() => {
                    if (filterJenisOTIds.length === jenisOvertimeList.length) {
                      setFilterJenisOTIds([])
                    } else {
                      setFilterJenisOTIds(jenisOvertimeList.map(ot => ot.id))
                    }
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {filterJenisOTIds.length === jenisOvertimeList.length ? 'Clear All' : 'Select All'}
                </button>
              </div>
              <div className="border border-gray-300 rounded max-h-40 overflow-y-auto p-2 bg-white">
                {jenisOvertimeList.map(ot => (
                  <label key={ot.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterJenisOTIds.includes(ot.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilterJenisOTIds([...filterJenisOTIds, ot.id])
                        } else {
                          setFilterJenisOTIds(filterJenisOTIds.filter(id => id !== ot.id))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{ot.nama}</span>
                  </label>
                ))}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {filterJenisOTIds.length === 0 ? 'Semua jenis OT' : `${filterJenisOTIds.length} dipilih`}
              </div>
            </div>
          </div>

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
            <div className="w-6 h-6 bg-teal-50 border-l-4 border-teal-500 rounded shadow-sm"></div>
            <span className="text-teal-900 font-medium">Sudah hadir</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-amber-50 border-l-4 border-amber-400 rounded shadow-sm"></div>
            <span className="text-amber-900 font-medium">Belum input</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-pink-50 border-l-4 border-pink-500 rounded shadow-sm"></div>
            <span className="text-pink-900 font-medium">Tidak hadir</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-50 border border-gray-300 rounded"></div>
            <span className="text-gray-600">Tidak ada tugas</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-blue-800">
          <div>
            <strong>💡 Border kiri</strong> = Status warna lebih jelas
          </div>
          <div>
            <strong>📊 Rencana | Aktual</strong> = Di bawah nama pekerja
          </div>
          <div>
            <strong>🔒 Nama freeze</strong> = Saat scroll horizontal, nama tetap terlihat
          </div>
          <div>
            <strong>📦 Multiple OT</strong> = Auto gabung dalam 1 card + total jam
          </div>
        </div>
      </div>

      {/* Schedule Board */}
      <div className="card overflow-x-auto">
        <div className="min-w-max relative">
          {/* Header Row - Dates */}
          <div className="flex border-b-2 border-gray-300 bg-gray-50 sticky top-0 z-10">
            <div className="w-52 flex-shrink-0 p-3 font-semibold border-r-2 border-gray-300 flex items-center gap-2 bg-white sticky left-0 z-20">
              <Users className="w-5 h-5" />
              <div>
                <div>Pekerja ({filterPekerjaIds.length > 0 ? filterPekerjaIds.length : pekerjaList.length})</div>
                <div className="text-[10px] font-normal text-gray-600">Jam: Rencana | Aktual</div>
              </div>
            </div>
            {dates.map((date, i) => {
              const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
              const isWeekend = date.getDay() === 0 || date.getDay() === 6
              const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
              const dayName = dayNames[date.getDay()]
              
              return (
                <div 
                  key={i} 
                  className={`w-32 flex-shrink-0 p-2 text-center border-r border-gray-200 ${
                    isToday ? 'bg-blue-100 font-bold' : ''
                  } ${isWeekend ? 'bg-yellow-50' : ''}`}
                >
                  <div className="text-xs font-semibold">{dayName}</div>
                  <div className={`text-sm ${isToday ? 'text-blue-700' : ''}`}>
                    {format(date, 'dd/MM')}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Data Rows - Workers */}
          {pekerjaList
            .filter(p => {
              // Filter berdasarkan pekerja (multi-select)
              if (filterPekerjaIds.length > 0 && !filterPekerjaIds.includes(p.id)) {
                return false
              }
              
              // Filter berdasarkan jenis OT (multi-select)
              if (filterJenisOTIds.length > 0) {
                const workerSchedule = scheduleData[p.id]
                if (!workerSchedule) return false
                
                // Cek apakah pekerja ini punya jadwal untuk salah satu jenis OT yang dipilih
                const hasSelectedOT = Object.values(workerSchedule.schedule).some(daySchedule => 
                  daySchedule.some(item => {
                    const jenisOTId = jenisOvertimeList.find(ot => ot.nama === item.jenis)?.id
                    return jenisOTId && filterJenisOTIds.includes(jenisOTId)
                  })
                )
                return hasSelectedOT
              }
              
              return true
            })
            .map((pekerja) => {
            const workerSchedule = scheduleData[pekerja.id]
            if (!workerSchedule) return null
            
            // Hitung total JAM rencana dan JAM aktual
            let totalJamRencana = 0
            let totalJamAktual = 0
            dates.forEach(date => {
              const tanggal = format(date, 'yyyy-MM-dd')
              const daySchedule = (workerSchedule.schedule[tanggal] || [])
                .filter(item => {
                  if (filterJenisOTIds.length === 0) return true
                  const jenisOTId = jenisOvertimeList.find(ot => ot.nama === item.jenis)?.id
                  return jenisOTId && filterJenisOTIds.includes(jenisOTId)
                })
              daySchedule.forEach(item => {
                totalJamRencana += item.durasi // Tambah JAM, bukan count
                if (item.hasActual && item.dilaksanakan) {
                  totalJamAktual += item.durasi // Tambah JAM, bukan count
                }
              })
            })

            return (
              <div key={pekerja.id} className="flex border-b border-gray-200 hover:bg-gray-50">
                <div className="w-52 flex-shrink-0 p-2 font-medium border-r-2 border-gray-300 bg-white sticky left-0 z-10">
                  <div className="text-sm font-semibold truncate" title={pekerja.nama}>
                    {pekerja.nama}
                  </div>
                  <div className="text-xs text-gray-500">{pekerja.nik}</div>
                  <div className="text-[11px] font-semibold mt-1 pt-1 border-t border-gray-200">
                    <span className="text-blue-700">{totalJamRencana}j</span>
                    <span className="text-gray-400 mx-1">|</span>
                    <span className={totalJamAktual < totalJamRencana ? 'text-orange-600' : 'text-emerald-600'}>
                      {totalJamAktual}j
                    </span>
                  </div>
                </div>
                {dates.map((date, i) => {
                  const tanggal = format(date, 'yyyy-MM-dd')
                  const daySchedule = (workerSchedule.schedule[tanggal] || [])
                    .filter(item => {
                      if (filterJenisOTIds.length === 0) return true
                      const jenisOTId = jenisOvertimeList.find(ot => ot.nama === item.jenis)?.id
                      return jenisOTId && filterJenisOTIds.includes(jenisOTId)
                    })
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
                          <div className="w-full h-8 bg-gray-50 rounded"></div>
                        </div>
                      ) : (
                        // Multiple OT dalam 1 card compact
                        <div className="space-y-0.5">
                          {daySchedule.length === 1 ? (
                            // Single OT - tampilkan normal
                            (() => {
                              const item = daySchedule[0]
                              let bgColor = 'bg-amber-50 border-l-4 border-amber-400'
                              let textColor = 'text-amber-900'
                              
                              if (item.hasActual) {
                                if (item.dilaksanakan) {
                                  bgColor = 'bg-teal-50 border-l-4 border-teal-500'
                                  textColor = 'text-teal-900'
                                } else {
                                  bgColor = 'bg-pink-50 border-l-4 border-pink-500'
                                  textColor = 'text-pink-900'
                                }
                              }
                              
                              return (
                                <div 
                                  className={`px-2 py-2 rounded ${bgColor} shadow-sm`}
                                  title={`${item.jenis} - ${item.durasi} jam - Grup ${item.grup}`}
                                >
                                  <div className={`font-bold text-sm truncate ${textColor}`}>
                                    {item.jenis}
                                  </div>
                                  <div className={`text-xs flex justify-between mt-1 ${textColor} opacity-80`}>
                                    <span className="font-semibold">{item.durasi}j</span>
                                    <span>G{item.grup}</span>
                                  </div>
                                </div>
                              )
                            })()
                          ) : (
                            // Multiple OT - gabung dalam 1 card compact
                            (() => {
                              const totalJam = daySchedule.reduce((sum, item) => sum + item.durasi, 0)
                              const hasAnyActual = daySchedule.some(item => item.hasActual)
                              const allHadir = daySchedule.every(item => item.hasActual && item.dilaksanakan)
                              const anyTidakHadir = daySchedule.some(item => item.hasActual && !item.dilaksanakan)
                              
                              let bgColor = 'bg-amber-50 border-l-4 border-amber-400'
                              let textColor = 'text-amber-900'
                              
                              if (hasAnyActual) {
                                if (allHadir) {
                                  bgColor = 'bg-teal-50 border-l-4 border-teal-500'
                                  textColor = 'text-teal-900'
                                } else if (anyTidakHadir) {
                                  bgColor = 'bg-pink-50 border-l-4 border-pink-500'
                                  textColor = 'text-pink-900'
                                }
                              }
                              
                              return (
                                <div 
                                  className={`px-2 py-2 rounded ${bgColor} shadow-sm`}
                                  title={daySchedule.map(item => `${item.jenis} (${item.durasi}j)`).join(' + ')}
                                >
                                  <div className={`font-bold text-xs ${textColor} leading-tight space-y-0.5`}>
                                    {daySchedule.map((item, i) => (
                                      <div key={i} className="truncate">
                                        • {item.jenis} {item.durasi}j
                                      </div>
                                    ))}
                                  </div>
                                  <div className={`text-xs font-bold mt-1 pt-1 border-t ${textColor} border-current opacity-50`}>
                                    Σ {totalJam}j
                                  </div>
                                </div>
                              )
                            })()
                          )}
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