import { useState, useEffect } from 'react'
import { ClipboardCheck, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/rotation'
import type { RencanaOvertime, Pekerja } from '../types'

export default function ActualInput() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [rencanaList, setRencanaList] = useState<RencanaOvertime[]>([])
  const [selectedRencana, setSelectedRencana] = useState<string>('')
  const [pekerjaList, setPekerjaList] = useState<Pekerja[]>([])
  const [aktualData, setAktualData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (selectedDate) {
      fetchRencanaByDate()
    }
  }, [selectedDate])

  useEffect(() => {
    if (selectedRencana) {
      fetchPekerjaByRencana()
    }
  }, [selectedRencana])

  const fetchRencanaByDate = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('rencana_overtime')
      .select(`
        *,
        jenis_overtime (*)
      `)
      .eq('tanggal', selectedDate)

    if (data) {
      setRencanaList(data)
      if (data.length > 0) {
        setSelectedRencana(data[0].id)
      }
    }
    setLoading(false)
  }

  const fetchPekerjaByRencana = async () => {
    const { data } = await supabase
      .from('pekerja_rencana')
      .select(`
        *,
        pekerja (*)
      `)
      .eq('rencana_overtime_id', selectedRencana)

    if (data) {
      const pekerjaData = data.map(pr => pr.pekerja as Pekerja)
      setPekerjaList(pekerjaData)
      
      // Initialize aktual data
      const initialAktual = pekerjaData.map(p => ({
        pekerja_id: p.id,
        pekerja_nama: p.nama,
        dilaksanakan: true,
        durasi_aktual: null,
        sesuai_rencana: true,
        keterangan: ''
      }))
      setAktualData(initialAktual)
    }
  }

  const handleInputChange = (pekerjaId: string, field: string, value: any) => {
    setAktualData(prev => prev.map(item => 
      item.pekerja_id === pekerjaId 
        ? { ...item, [field]: value }
        : item
    ))
  }

  const handleSaveAktual = async () => {
    if (!selectedRencana) {
      setMessage('Pilih rencana overtime terlebih dahulu')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      const insertData = aktualData.map(item => ({
        rencana_overtime_id: selectedRencana,
        pekerja_id: item.pekerja_id,
        tanggal: selectedDate,
        dilaksanakan: item.dilaksanakan,
        durasi_aktual: item.dilaksanakan ? item.durasi_aktual : null,
        sesuai_rencana: item.sesuai_rencana,
        keterangan: item.keterangan || null
      }))

      const { error } = await supabase
        .from('aktual_overtime')
        .upsert(insertData, { 
          onConflict: 'rencana_overtime_id,pekerja_id,tanggal'
        })

      if (error) throw error

      setMessage('Data aktual berhasil disimpan!')
    } catch (error: any) {
      setMessage('Error: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedRencanaData = rencanaList.find(r => r.id === selectedRencana)

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6" />
          Input Aktual Overtime
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Pilih Tanggal</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field"
            />
          </div>

          {rencanaList.length > 0 && (
            <div>
              <label className="label">Jenis Overtime</label>
              <select
                value={selectedRencana}
                onChange={(e) => setSelectedRencana(e.target.value)}
                className="input-field"
              >
                {rencanaList.map(rencana => (
                  <option key={rencana.id} value={rencana.id}>
                    {rencana.jenis_overtime?.nama} - {rencana.durasi_jam} jam (Grup {rencana.grup_rotasi})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading && (
          <p className="text-gray-600">Memuat data...</p>
        )}

        {!loading && rencanaList.length === 0 && selectedDate && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">
              Tidak ada rencana overtime untuk tanggal {formatDate(selectedDate)}
            </p>
          </div>
        )}

        {message && (
          <div className={`p-4 rounded-lg ${
            message.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
          }`}>
            {message}
          </div>
        )}
      </div>

      {selectedRencanaData && pekerjaList.length > 0 && (
        <div className="card">
          <div className="mb-4 pb-4 border-b">
            <h3 className="text-xl font-semibold">{selectedRencanaData.jenis_overtime?.nama}</h3>
            <p className="text-sm text-gray-600">
              Durasi Rencana: {selectedRencanaData.durasi_jam} jam | 
              Tanggal: {formatDate(selectedDate)} | 
              Grup: {selectedRencanaData.grup_rotasi}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Pekerja</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Dilaksanakan</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Durasi Aktual (jam)</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Sesuai Rencana</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {aktualData.map((item) => (
                  <tr key={item.pekerja_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {item.pekerja_nama}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={item.dilaksanakan}
                        onChange={(e) => handleInputChange(item.pekerja_id, 'dilaksanakan', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        max="8"
                        step="0.5"
                        value={item.durasi_aktual || ''}
                        onChange={(e) => handleInputChange(item.pekerja_id, 'durasi_aktual', parseFloat(e.target.value) || null)}
                        disabled={!item.dilaksanakan}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={item.sesuai_rencana}
                        onChange={(e) => handleInputChange(item.pekerja_id, 'sesuai_rencana', e.target.checked)}
                        disabled={!item.dilaksanakan}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.keterangan}
                        onChange={(e) => handleInputChange(item.pekerja_id, 'keterangan', e.target.value)}
                        disabled={!item.dilaksanakan}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        placeholder="Misal: cuaca buruk, selesai lebih cepat"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSaveAktual}
              disabled={saving}
              className="btn-success disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Data Aktual'}
            </button>
          </div>
        </div>
      )}

      <div className="card bg-blue-50 border border-blue-200">
        <h3 className="font-semibold mb-2 text-blue-900">Petunjuk Pengisian</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Centang "Dilaksanakan" jika pekerja hadir overtime</li>
          <li>• Isi durasi aktual dalam jam (bisa desimal, misal 1.5 jam)</li>
          <li>• Uncheck "Sesuai Rencana" jika durasi berbeda dari rencana</li>
          <li>• Isi keterangan jika ada penyimpangan (cuaca, pekerjaan selesai lebih cepat, dll)</li>
        </ul>
      </div>
    </div>
  )
}