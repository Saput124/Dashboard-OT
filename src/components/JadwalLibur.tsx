import { useState, useEffect } from 'react'
import { Calendar, Sun, AlertCircle, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format, addDays, differenceInDays } from 'date-fns'
import { isSunday, isHoliday, getHolidayName, getAllHolidays } from '../utils/holidays'
import type { JenisOvertime, Pekerja } from '../types'

export default function JadwalLibur() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedPekerjaIds, setSelectedPekerjaIds] = useState<string[]>([])
  const [selectedOvertimeIds, setSelectedOvertimeIds] = useState<string[]>([])
  const [pekerjaList, setPekerjaList] = useState<Pekerja[]>([])
  const [jenisOvertimeList, setJenisOvertimeList] = useState<JenisOvertime[]>([])
  const [liburDays, setLiburDays] = useState<any[]>([])
  const [generatedSchedule, setGeneratedSchedule] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (startDate && endDate) {
      findLiburDays()
    }
  }, [startDate, endDate])

  const fetchData = async () => {
    const { data: pekerja } = await supabase
      .from('pekerja')
      .select('*')
      .order('nama')
    
    const { data: overtime } = await supabase
      .from('jenis_overtime')
      .select('*')
      .order('nama')

    if (pekerja) setPekerjaList(pekerja)
    if (overtime) setJenisOvertimeList(overtime)
  }

  const findLiburDays = () => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const totalDays = differenceInDays(end, start) + 1
    
    const libur: any[] = []
    
    for (let i = 0; i < totalDays; i++) {
      const current = addDays(start, i)
      const dateStr = format(current, 'yyyy-MM-dd')
      const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
      const dayName = dayNames[current.getDay()]
      
      if (isSunday(current)) {
        libur.push({
          tanggal: dateStr,
          dayName,
          type: 'Minggu',
          name: 'Hari Minggu'
        })
      } else if (isHoliday(current)) {
        libur.push({
          tanggal: dateStr,
          dayName,
          type: 'Libur Nasional',
          name: getHolidayName(current)
        })
      }
    }
    
    setLiburDays(libur)
  }

  const handleGenerate = () => {
    if (selectedPekerjaIds.length === 0) {
      setMessage('Error: Pilih minimal 1 pekerja')
      return
    }
    if (selectedOvertimeIds.length === 0) {
      setMessage('Error: Pilih minimal 1 jenis overtime')
      return
    }
    if (liburDays.length === 0) {
      setMessage('Error: Tidak ada hari libur dalam periode yang dipilih')
      return
    }

    setLoading(true)
    setMessage('')

    const schedules: any[] = []
    const selectedPekerja = pekerjaList.filter(p => selectedPekerjaIds.includes(p.id))
    const selectedOvertime = jenisOvertimeList.filter(ot => selectedOvertimeIds.includes(ot.id))

    // Generate untuk setiap hari libur
    liburDays.forEach(libur => {
      selectedOvertime.forEach(jenisOT => {
        const alokasi = jenisOT.alokasi_pekerja
        
        // Pilih pekerja secara round-robin
        const assignedPekerja = []
        for (let i = 0; i < Math.min(alokasi, selectedPekerja.length); i++) {
          assignedPekerja.push(selectedPekerja[i % selectedPekerja.length])
        }

        schedules.push({
          tanggal: libur.tanggal,
          jenis_overtime_id: jenisOT.id,
          durasi_jam: jenisOT.durasi_jam,
          is_minggu: libur.type === 'Minggu',
          grup_rotasi: 0, // Libur tidak pakai grup
          assigned_pekerja: assignedPekerja,
          jenis_overtime: jenisOT,
          libur_info: libur
        })
      })
    })

    setGeneratedSchedule(schedules)
    setMessage(`✅ Jadwal libur berhasil dibuat! Total ${liburDays.length} hari libur, ${schedules.length} jadwal.`)
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    try {
      for (const schedule of generatedSchedule) {
        const { assigned_pekerja, jenis_overtime, libur_info, ...rencanaData } = schedule

        const { data: rencana, error: rencanaError } = await supabase
          .from('rencana_overtime')
          .insert(rencanaData)
          .select()
          .single()

        if (rencanaError) {
          console.error('Error inserting rencana:', rencanaError)
          continue
        }

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

      setMessage('✅ Jadwal libur berhasil disimpan!')
      setGeneratedSchedule([])
    } catch (error: any) {
      setMessage('❌ Error: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Sun className="w-8 h-8 text-orange-500" />
        <div>
          <h2 className="text-2xl font-bold">Jadwal Overtime Hari Libur</h2>
          <p className="text-sm text-gray-600">Generate jadwal khusus untuk hari Minggu & tanggal merah</p>
        </div>
      </div>

      {/* Info */}
      <div className="card bg-yellow-50 border border-yellow-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p><strong>Catatan:</strong> Jadwal ini khusus untuk hari Minggu dan tanggal merah (libur nasional).</p>
            <p className="mt-1">Durasi OT hari libur biasanya lebih panjang (misal: 7 jam) dengan upah yang berbeda dari hari biasa.</p>
          </div>
        </div>
      </div>

      {/* Form Generate */}
      <div className="card">
        <h3 className="text-xl font-bold mb-4">Generate Jadwal Libur</h3>

        <div className="space-y-4">
          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Tanggal Mulai</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Tanggal Selesai</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          {/* Hari Libur yang Ditemukan */}
          {liburDays.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <div className="font-semibold text-blue-900 mb-2">
                Hari Libur Ditemukan: {liburDays.length} hari
              </div>
              <div className="flex flex-wrap gap-2">
                {liburDays.map(libur => (
                  <div key={libur.tanggal} className="bg-white border border-blue-300 rounded px-3 py-1 text-sm">
                    <span className="font-semibold">{format(new Date(libur.tanggal), 'dd MMM')}</span>
                    {' - '}
                    <span className="text-blue-700">{libur.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Select Pekerja */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Pilih Pekerja</label>
              <button
                onClick={() => {
                  if (selectedPekerjaIds.length === pekerjaList.length) {
                    setSelectedPekerjaIds([])
                  } else {
                    setSelectedPekerjaIds(pekerjaList.map(p => p.id))
                  }
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedPekerjaIds.length === pekerjaList.length ? 'Unselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto border border-gray-200 rounded p-3">
              {pekerjaList.map(pekerja => (
                <label key={pekerja.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedPekerjaIds.includes(pekerja.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPekerjaIds([...selectedPekerjaIds, pekerja.id])
                      } else {
                        setSelectedPekerjaIds(selectedPekerjaIds.filter(id => id !== pekerja.id))
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{pekerja.nama}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Select Jenis OT */}
          <div>
            <label className="label">Pilih Jenis Overtime</label>
            <div className="space-y-2">
              {jenisOvertimeList.map(ot => (
                <label key={ot.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedOvertimeIds.includes(ot.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedOvertimeIds([...selectedOvertimeIds, ot.id])
                      } else {
                        setSelectedOvertimeIds(selectedOvertimeIds.filter(id => id !== ot.id))
                      }
                    }}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <div className="font-semibold">{ot.nama}</div>
                    <div className="text-sm text-gray-600">{ot.durasi_jam} jam, {ot.alokasi_pekerja} pekerja/hari</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Button */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="btn-primary w-full"
          >
            <Calendar className="w-5 h-5" />
            {loading ? 'Generating...' : 'Generate Jadwal Libur'}
          </button>

          {/* Message */}
          {message && (
            <div className={`p-3 rounded ${message.includes('Error') || message.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {message}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {generatedSchedule.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Preview Jadwal Libur</h3>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Menyimpan...' : 'Simpan Jadwal'}
            </button>
          </div>

          <div className="space-y-4">
            {liburDays.map(libur => {
              const daySchedules = generatedSchedule.filter(s => s.tanggal === libur.tanggal)
              
              return (
                <div key={libur.tanggal} className="border border-orange-300 rounded-lg p-4 bg-orange-50">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-lg">
                        {format(new Date(libur.tanggal), 'dd MMMM yyyy')}
                      </h4>
                      <p className="text-sm text-orange-700">
                        <Sun className="w-4 h-4 inline mr-1" />
                        {libur.name}
                      </p>
                    </div>
                    <span className="bg-orange-200 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                      {libur.type}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {daySchedules.map((schedule, idx) => (
                      <div key={idx} className="bg-white rounded p-3 border border-orange-200">
                        <div className="flex items-start justify-between">
                          <div>
                            <h5 className="font-medium">{schedule.jenis_overtime.nama}</h5>
                            <p className="text-sm text-gray-600">{schedule.durasi_jam} jam</p>
                          </div>
                        </div>
                        <div className="mt-2 text-sm">
                          <span className="font-medium">{schedule.assigned_pekerja.length} pekerja:</span>
                          <span className="text-gray-600 ml-2">
                            {schedule.assigned_pekerja.map((p: Pekerja) => p.nama).join(', ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
