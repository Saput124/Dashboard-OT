import { useState, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Users, Download, FileDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { addDays, format, startOfDay, differenceInDays } from 'date-fns'
import { getShortDayName } from '../utils/rotation'
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
  const [selectedPekerjaFilter, setSelectedPekerjaFilter] = useState<string[]>([])
  const [selectedOvertimeFilter, setSelectedOvertimeFilter] = useState<string[]>([])

  const totalDays = differenceInDays(endDate, startDate) + 1
  const dates = Array.from({ length: totalDays }, (_, i) => addDays(startOfDay(startDate), i))

  useEffect(() => {
    fetchScheduleBoard()
  }, [startDate, endDate])

  // Auto-select all pekerja by default
  useEffect(() => {
    if (pekerjaList.length > 0 && selectedPekerjaFilter.length === 0) {
      setSelectedPekerjaFilter(pekerjaList.map(p => p.id))
    }
  }, [pekerjaList])

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

      {/* Export Section */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg mb-1">📥 Export Jadwal</h3>
            <p className="text-sm text-gray-600">Download jadwal dalam format PDF atau Excel</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportToPDF(
                scheduleData,
                dates,
                pekerjaList,
                selectedPekerjaFilter,
                selectedOvertimeFilter
              )}
              className="btn-secondary flex items-center gap-2 px-4 py-2"
              title="Download jadwal dalam format PDF"
            >
              <FileDown className="w-4 h-4" />
              Download PDF
            </button>
            <button
              onClick={() => exportToExcel(
                scheduleData,
                dates,
                pekerjaList,
                selectedPekerjaFilter,
                selectedOvertimeFilter
              )}
              className="btn-primary flex items-center gap-2 px-4 py-2"
              title="Download jadwal dalam format Excel"
            >
              <Download className="w-4 h-4" />
              Download Excel
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
      </div>

      {/* Multi-Select Filter */}
      <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
        <h3 className="font-semibold mb-3 text-blue-900 flex items-center gap-2 text-lg">
          <span>🎛️</span> Filter Tampilan
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Filter Pekerja */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">👥 Filter Pekerja</label>
              <button
                onClick={() => {
                  if (selectedPekerjaFilter.length === pekerjaList.length) {
                    setSelectedPekerjaFilter([])
                  } else {
                    setSelectedPekerjaFilter(pekerjaList.map(p => p.id))
                  }
                }}
                className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-medium"
              >
                {selectedPekerjaFilter.length === pekerjaList.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto bg-gray-50 rounded p-3 space-y-1.5 border border-gray-200">
              {pekerjaList.map(pekerja => (
                <label 
                  key={pekerja.id} 
                  className="flex items-center gap-2 text-sm hover:bg-white p-2 rounded cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedPekerjaFilter.includes(pekerja.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPekerjaFilter([...selectedPekerjaFilter, pekerja.id])
                      } else {
                        setSelectedPekerjaFilter(selectedPekerjaFilter.filter(id => id !== pekerja.id))
                      }
                    }}
                    className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="font-medium">{pekerja.nama}</span>
                  <span className="text-xs text-gray-500">({pekerja.nik})</span>
                </label>
              ))}
            </div>
            <div className="text-xs text-gray-600 mt-2 px-1">
              Terpilih: <span className="font-semibold text-blue-600">{selectedPekerjaFilter.length}</span> dari {pekerjaList.length} pekerja
            </div>
          </div>

          {/* Filter Jenis OT */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">⏰ Filter Jenis Overtime</label>
              <button
                onClick={() => {
                  const uniqueOT = Array.from(
                    new Set(
                      Object.values(scheduleData).flatMap((worker: any) => 
                        Object.values(worker.schedule).flatMap((day: any) =>
                          day.map((item: any) => item.jenis)
                        )
                      )
                    )
                  )
                  
                  if (selectedOvertimeFilter.length === uniqueOT.length) {
                    setSelectedOvertimeFilter([])
                  } else {
                    setSelectedOvertimeFilter(uniqueOT as string[])
                  }
                }}
                className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-medium"
              >
                {selectedOvertimeFilter.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto bg-gray-50 rounded p-3 space-y-1.5 border border-gray-200">
              {Array.from(
                new Set(
                  Object.values(scheduleData).flatMap((worker: any) => 
                    Object.values(worker.schedule).flatMap((day: any) =>
                      day.map((item: any) => item.jenis)
                    )
                  )
                )
              ).map((jenisName: any) => (
                <label 
                  key={jenisName} 
                  className="flex items-center gap-2 text-sm hover:bg-white p-2 rounded cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedOvertimeFilter.includes(jenisName)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedOvertimeFilter([...selectedOvertimeFilter, jenisName])
                      } else {
                        setSelectedOvertimeFilter(selectedOvertimeFilter.filter(name => name !== jenisName))
                      }
                    }}
                    className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="font-medium">{jenisName}</span>
                </label>
              ))}
            </div>
            <div className="text-xs text-gray-600 mt-2 px-1">
              Terpilih: <span className="font-semibold text-blue-600">{selectedOvertimeFilter.length}</span> jenis overtime
            </div>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-blue-100 rounded-lg border border-blue-300">
          <p className="text-sm text-blue-800">
            💡 <strong>Tip:</strong> Filter ini juga berlaku untuk export PDF & Excel
          </p>
        </div>
      </div>

      {/* Schedule Board */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {/* Header Row */}
          <div className="flex border-b-2 border-gray-300 bg-gray-50">
            <div className="w-64 flex-shrink-0 p-3 font-semibold border-r-2 border-gray-300 sticky left-0 z-20 bg-gray-50">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <span className="text-lg">Pekerja ({pekerjaList.filter(p => {
                  const ws = scheduleData[p.id]
                  if (!ws) return false
                  return Object.values(ws.schedule).some(day => day.length > 0)
                }).length})</span>
              </div>
              <div className="text-xs font-normal text-gray-600 mt-1">Status & Pencapaian</div>
            </div>
            {dates.map((date, i) => {
              const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
              const isWeekend = date.getDay() === 0 || date.getDay() === 6
              return (
                <div 
                  key={i} 
                  className={`w-36 flex-shrink-0 p-2 text-center border-r border-gray-200 ${
                    isToday ? 'bg-blue-100 font-bold' : ''
                  } ${isWeekend ? 'bg-yellow-50' : ''}`}
                >
                  <div className="text-base font-semibold">{getShortDayName(format(date, 'yyyy-MM-dd'))}</div>
                  <div className={`text-lg font-bold ${isToday ? 'text-blue-700' : ''}`}>
                    {format(date, 'dd/MM')}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Data Rows - Workers */}
          {pekerjaList
            .filter(pekerja => selectedPekerjaFilter.includes(pekerja.id))
            .map((pekerja) => {
            const workerSchedule = scheduleData[pekerja.id]
            if (!workerSchedule) return null
            
            // Hitung total JAM rencana dan JAM aktual
            let totalJamRencana = 0
            let totalJamAktual = 0
            dates.forEach(date => {
              const tanggal = format(date, 'yyyy-MM-dd')
              const daySchedule = workerSchedule.schedule[tanggal] || []
              
              // Apply overtime filter
              const filteredSchedule = selectedOvertimeFilter.length > 0
                ? daySchedule.filter(item => selectedOvertimeFilter.includes(item.jenis))
                : daySchedule
              
              filteredSchedule.forEach(item => {
                totalJamRencana += item.durasi
                if (item.hasActual && item.dilaksanakan) {
                  totalJamAktual += item.durasi
                }
              })
            })
            
            // Skip pekerja yang tidak punya jadwal sama sekali
            if (totalJamRencana === 0) return null
            
            // Hitung persentase dan status
            const persentase = totalJamRencana > 0 ? (totalJamAktual / totalJamRencana) * 100 : 0
            let statusBadge = { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Belum Input' }
            
            if (totalJamAktual > 0) {
              if (persentase >= 90) {
                statusBadge = { bg: 'bg-emerald-100', text: 'text-emerald-800', label: '✓ Optimal' }
              } else if (persentase >= 70) {
                statusBadge = { bg: 'bg-blue-100', text: 'text-blue-800', label: '→ Baik' }
              } else if (persentase >= 50) {
                statusBadge = { bg: 'bg-orange-100', text: 'text-orange-800', label: '⚠ Cukup' }
              } else {
                statusBadge = { bg: 'bg-red-100', text: 'text-red-800', label: '✗ Kurang' }
              }
            }

            return (
              <div key={pekerja.id} className="flex border-b border-gray-200 hover:bg-gray-50">
                <div className="w-64 flex-shrink-0 p-3 font-medium border-r-2 border-gray-300 bg-white sticky left-0 z-10">
                  <div className="text-lg font-bold truncate" title={pekerja.nama}>
                    {pekerja.nama}
                  </div>
                  <div className="text-base text-gray-600">{pekerja.nik}</div>
                  
                  {/* Status Badge */}
                  <div className={`mt-2 px-2 py-1 rounded text-xs font-bold ${statusBadge.bg} ${statusBadge.text} text-center`}>
                    {statusBadge.label}
                  </div>
                  
                  {/* Jam Rencana vs Aktual */}
                  <div className="text-sm font-bold mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-gray-500">Rencana</div>
                      <div className="text-blue-700">{totalJamRencana} jam</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Aktual</div>
                      <div className={totalJamAktual < totalJamRencana ? 'text-orange-600' : 'text-emerald-600'}>
                        {totalJamAktual} jam
                      </div>
                    </div>
                  </div>
                  
                  {/* Persentase */}
                  {totalJamAktual > 0 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600">Pencapaian</span>
                        <span className="font-bold">{persentase.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            persentase >= 90 ? 'bg-emerald-500' :
                            persentase >= 70 ? 'bg-blue-500' :
                            persentase >= 50 ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(persentase, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
                {dates.map((date, i) => {
                  const tanggal = format(date, 'yyyy-MM-dd')
                  const daySchedule = workerSchedule.schedule[tanggal] || []
                  
                  // Apply overtime filter
                  const filteredSchedule = selectedOvertimeFilter.length > 0
                    ? daySchedule.filter(item => selectedOvertimeFilter.includes(item.jenis))
                    : daySchedule
                  
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6

                  return (
                    <div 
                      key={i} 
                      className={`w-36 flex-shrink-0 p-2 border-r border-gray-200 ${
                        isWeekend ? 'bg-yellow-50' : 'bg-white'
                      }`}
                    >
                      {filteredSchedule.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                          <div className="w-full h-10 bg-gray-50 rounded"></div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {filteredSchedule.length === 1 ? (
                            // Single OT
                            (() => {
                              const item = filteredSchedule[0]
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
                            // Multiple OT
                            (() => {
                              const totalJam = filteredSchedule.reduce((sum, item) => sum + item.durasi, 0)
                              const hasAnyActual = filteredSchedule.some(item => item.hasActual)
                              const allHadir = filteredSchedule.every(item => item.hasActual && item.dilaksanakan)
                              const anyTidakHadir = filteredSchedule.some(item => item.hasActual && !item.dilaksanakan)
                              
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
                                  title={filteredSchedule.map(item => `${item.jenis} (${item.durasi}j)`).join(' + ')}
                                >
                                  <div className={`font-bold text-xs ${textColor} leading-tight space-y-0.5`}>
                                    {filteredSchedule.map((item, idx) => (
                                      <div key={idx} className="truncate">
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
          })
          .filter(Boolean) // Remove null entries
          }
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
