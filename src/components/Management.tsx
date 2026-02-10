import { useState, useEffect } from 'react'
import { Users, Briefcase, Plus, Edit2, Trash2, Save, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Pekerja, JenisOvertime } from '../types'

export default function Management() {
  const [activeTab, setActiveTab] = useState<'pekerja' | 'overtime'>('pekerja')
  const [pekerjaList, setPekerjaList] = useState<Pekerja[]>([])
  const [overtimeList, setOvertimeList] = useState<JenisOvertime[]>([])
  const [editingPekerja, setEditingPekerja] = useState<Pekerja | null>(null)
  const [editingOvertime, setEditingOvertime] = useState<JenisOvertime | null>(null)
  const [isAddingPekerja, setIsAddingPekerja] = useState(false)
  const [isAddingOvertime, setIsAddingOvertime] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchPekerja()
    fetchOvertime()
  }, [])

  const fetchPekerja = async () => {
    const { data } = await supabase
      .from('pekerja')
      .select('*')
      .order('nama', { ascending: true })
    if (data) setPekerjaList(data)
  }

  const fetchOvertime = async () => {
    const { data } = await supabase
      .from('jenis_overtime')
      .select('*')
      .order('nama', { ascending: true })
    if (data) setOvertimeList(data)
  }

  // Pekerja CRUD
  const handleSavePekerja = async (pekerja: Partial<Pekerja>) => {
    try {
      if (pekerja.id) {
        // Update
        const { error } = await supabase
          .from('pekerja')
          .update({ nama: pekerja.nama, nip: pekerja.nip, aktif: pekerja.aktif })
          .eq('id', pekerja.id)
        if (error) throw error
        setMessage('Pekerja berhasil diupdate')
      } else {
        // Insert
        const { error } = await supabase
          .from('pekerja')
          .insert({ nama: pekerja.nama, nip: pekerja.nip, aktif: true })
        if (error) throw error
        setMessage('Pekerja berhasil ditambahkan')
      }
      fetchPekerja()
      setEditingPekerja(null)
      setIsAddingPekerja(false)
    } catch (error: any) {
      setMessage('Error: ' + error.message)
    }
  }

  const handleDeletePekerja = async (id: string) => {
    if (!confirm('Yakin ingin menghapus pekerja ini?')) return
    try {
      const { error } = await supabase.from('pekerja').delete().eq('id', id)
      if (error) throw error
      setMessage('Pekerja berhasil dihapus')
      fetchPekerja()
    } catch (error: any) {
      setMessage('Error: ' + error.message)
    }
  }

  // Overtime CRUD
  const handleSaveOvertime = async (overtime: Partial<JenisOvertime>) => {
    try {
      if (overtime.id) {
        // Update
        const { error } = await supabase
          .from('jenis_overtime')
          .update({
            nama: overtime.nama,
            alokasi_pekerja: overtime.alokasi_pekerja,
            durasi_jam: overtime.durasi_jam,
            keterangan: overtime.keterangan
          })
          .eq('id', overtime.id)
        if (error) throw error
        setMessage('Jenis overtime berhasil diupdate')
      } else {
        // Insert
        const { error } = await supabase
          .from('jenis_overtime')
          .insert({
            nama: overtime.nama,
            alokasi_pekerja: overtime.alokasi_pekerja,
            durasi_jam: overtime.durasi_jam,
            keterangan: overtime.keterangan
          })
        if (error) throw error
        setMessage('Jenis overtime berhasil ditambahkan')
      }
      fetchOvertime()
      setEditingOvertime(null)
      setIsAddingOvertime(false)
    } catch (error: any) {
      setMessage('Error: ' + error.message)
    }
  }

  const handleDeleteOvertime = async (id: string) => {
    if (!confirm('Yakin ingin menghapus jenis overtime ini?')) return
    try {
      const { error } = await supabase.from('jenis_overtime').delete().eq('id', id)
      if (error) throw error
      setMessage('Jenis overtime berhasil dihapus')
      fetchOvertime()
    } catch (error: any) {
      setMessage('Error: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Management Data</h2>
        <p className="text-gray-600">Kelola data pekerja dan jenis overtime</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('pekerja')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'pekerja'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-5 h-5" />
            Data Pekerja ({pekerjaList.length})
          </button>
          <button
            onClick={() => setActiveTab('overtime')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'overtime'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            Jenis Overtime ({overtimeList.length})
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
        }`}>
          {message}
        </div>
      )}

      {/* Pekerja Tab */}
      {activeTab === 'pekerja' && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Daftar Pekerja</h3>
            <button
              onClick={() => setIsAddingPekerja(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Tambah Pekerja
            </button>
          </div>

          {(isAddingPekerja || editingPekerja) && (
            <PekerjaForm
              pekerja={editingPekerja}
              onSave={handleSavePekerja}
              onCancel={() => {
                setIsAddingPekerja(false)
                setEditingPekerja(null)
              }}
            />
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">NIP</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nama</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pekerjaList.map((pekerja) => (
                  <tr key={pekerja.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{pekerja.nip}</td>
                    <td className="px-4 py-3 text-sm font-medium">{pekerja.nama}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        pekerja.aktif ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {pekerja.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingPekerja(pekerja)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePekerja(pekerja.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overtime Tab */}
      {activeTab === 'overtime' && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Daftar Jenis Overtime</h3>
            <button
              onClick={() => setIsAddingOvertime(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Tambah Jenis OT
            </button>
          </div>

          {(isAddingOvertime || editingOvertime) && (
            <OvertimeForm
              overtime={editingOvertime}
              onSave={handleSaveOvertime}
              onCancel={() => {
                setIsAddingOvertime(false)
                setEditingOvertime(null)
              }}
            />
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nama</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Alokasi</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Durasi</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Keterangan</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {overtimeList.map((overtime) => (
                  <tr key={overtime.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{overtime.nama}</td>
                    <td className="px-4 py-3 text-sm">{overtime.alokasi_pekerja} pekerja</td>
                    <td className="px-4 py-3 text-sm">{overtime.durasi_jam} jam</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{overtime.keterangan}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingOvertime(overtime)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteOvertime(overtime.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Pekerja Form Component
function PekerjaForm({ pekerja, onSave, onCancel }: any) {
  const [formData, setFormData] = useState({
    id: pekerja?.id || '',
    nama: pekerja?.nama || '',
    nip: pekerja?.nip || '',
    aktif: pekerja?.aktif ?? true
  })

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <h4 className="font-semibold mb-3">{pekerja ? 'Edit Pekerja' : 'Tambah Pekerja Baru'}</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">NIP</label>
          <input
            type="text"
            value={formData.nip}
            onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
            className="input-field"
            placeholder="NIP-0051"
          />
        </div>
        <div>
          <label className="label">Nama Lengkap</label>
          <input
            type="text"
            value={formData.nama}
            onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
            className="input-field"
            placeholder="Nama Pekerja"
          />
        </div>
        <div>
          <label className="label">Status</label>
          <select
            value={formData.aktif ? 'true' : 'false'}
            onChange={(e) => setFormData({ ...formData, aktif: e.target.value === 'true' })}
            className="input-field"
          >
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave(formData)} className="btn-success flex items-center gap-2">
          <Save className="w-4 h-4" />
          Simpan
        </button>
        <button onClick={onCancel} className="btn-secondary flex items-center gap-2">
          <X className="w-4 h-4" />
          Batal
        </button>
      </div>
    </div>
  )
}

// Overtime Form Component
function OvertimeForm({ overtime, onSave, onCancel }: any) {
  const [formData, setFormData] = useState({
    id: overtime?.id || '',
    nama: overtime?.nama || '',
    alokasi_pekerja: overtime?.alokasi_pekerja || 10,
    durasi_jam: overtime?.durasi_jam || 2,
    keterangan: overtime?.keterangan || ''
  })

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <h4 className="font-semibold mb-3">{overtime ? 'Edit Jenis Overtime' : 'Tambah Jenis Overtime Baru'}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Nama Jenis Overtime</label>
          <input
            type="text"
            value={formData.nama}
            onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
            className="input-field"
            placeholder="Misal: Maintenance Rutin"
          />
        </div>
        <div>
          <label className="label">Keterangan</label>
          <input
            type="text"
            value={formData.keterangan}
            onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
            className="input-field"
            placeholder="Deskripsi pekerjaan"
          />
        </div>
        <div>
          <label className="label">Alokasi Pekerja</label>
          <input
            type="number"
            min="1"
            max="50"
            value={formData.alokasi_pekerja}
            onChange={(e) => setFormData({ ...formData, alokasi_pekerja: parseInt(e.target.value) })}
            className="input-field"
          />
        </div>
        <div>
          <label className="label">Durasi (Jam)</label>
          <select
            value={formData.durasi_jam}
            onChange={(e) => setFormData({ ...formData, durasi_jam: parseInt(e.target.value) })}
            className="input-field"
          >
            <option value="1">1 jam</option>
            <option value="2">2 jam</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave(formData)} className="btn-success flex items-center gap-2">
          <Save className="w-4 h-4" />
          Simpan
        </button>
        <button onClick={onCancel} className="btn-secondary flex items-center gap-2">
          <X className="w-4 h-4" />
          Batal
        </button>
      </div>
    </div>
  )
}
