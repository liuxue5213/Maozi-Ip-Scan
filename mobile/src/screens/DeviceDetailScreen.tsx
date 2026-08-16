import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Modal,
  Pressable,
  TextInput
} from 'react-native'
import {
  Button,
  Card,
  Divider,
  IconButton,
  List,
  Chip
} from 'react-native-paper'
import { getNote, saveNote, deleteNote, NOTE_COLORS, DeviceNote } from '../services/notes'
import { useRoute, RouteProp } from '@react-navigation/native'

import { pingHost } from '../services/scanner'
import { lookupVendor } from '../services/network'
import type { RootStackParamList } from '../../App'

type DeviceDetailRouteProp = RouteProp<RootStackParamList, 'DeviceDetail'>

export default function DeviceDetailScreen() {
  const route = useRoute<DeviceDetailRouteProp>()
  const { device } = route.params
  const [pinging, setPinging] = useState(false)
  const [noteModalVisible, setNoteModalVisible] = useState(false)
  const [note, setNote] = useState<DeviceNote>({ ip: device.ip, name: '', note: '', color: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNote()
  }, [])

  const loadNote = async () => {
    const saved = await getNote(device.ip)
    if (saved) {
      setNote(saved)
    }
    setLoading(false)
  }

  const openNoteModal = () => {
    setNoteModalVisible(true)
  }

  const handleSaveNote = async () => {
    await saveNote(note)
    setNoteModalVisible(false)
  }

  const handleDeleteNote = async () => {
    await deleteNote(device.ip)
    setNote({ ip: device.ip, name: '', note: '', color: '' })
    setNoteModalVisible(false)
  }

  const handlePing = async () => {
    setPinging(true)
    const online = await pingHost(device.ip)
    setPinging(false)
    Alert.alert(
      'Ping 结果',
      online ? `${device.ip} 可达 ✅` : `${device.ip} 不可达 ❌`
    )
  }

  const openHTTP = (ip: string) => {
    Linking.openURL(`http://${ip}`).catch(() => {
      Alert.alert('错误', '无法打开浏览器')
    })
  }

  const openHTTPS = (ip: string) => {
    Linking.openURL(`https://${ip}`).catch(() => {
      Alert.alert('错误', '无法打开浏览器')
    })
  }

  return (
    <ScrollView style={styles.container}>
      {/* 基本信息 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.ipTitle}>{device.ip}</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>MAC 地址</Text>
            <Text style={styles.value}>
              {device.mac || 'N/A'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>厂商</Text>
            <Text style={styles.value}>
              {device.vendor || lookupVendor(device.mac) || '未知'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>主机名</Text>
            <Text style={styles.value}>{device.hostname || 'N/A'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>发现方式</Text>
            <Chip mode="outlined" compact>{device.source}</Chip>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>状态</Text>
            <Chip
              mode="flat"
              compact
              style={[
                styles.statusChip,
                device.status === 'online' && styles.onlineChip
              ]}
            >
              {device.status === 'online' ? '在线' : '离线'}
            </Chip>
          </View>
        </Card.Content>
      </Card>

      {/* 开放端口 */}
      {device.openPorts && device.openPorts.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>开放端口 ({device.openPorts.length})</Text>
            <Divider style={styles.divider} />
            <View style={styles.portsGrid}>
              {device.openPorts.map((port: number) => (
                <Chip key={port} mode="outlined" style={styles.portChip}>
                  {port}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}

      {/* 备注 */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.noteHeader}>
            <Text style={styles.sectionTitle}>备注</Text>
            <IconButton icon="pencil" size={20} onPress={openNoteModal} />
          </View>
          <Divider style={styles.divider} />
          {!loading && (note.name || note.note) ? (
            <View>
              {note.name ? (
                <Chip
                  mode="flat"
                  style={[styles.noteChip, note.color ? { backgroundColor: note.color + '20' } : undefined]}
                  textStyle={note.color ? { color: note.color } : undefined}
                >
                  {note.name}
                </Chip>
              ) : null}
              {note.note ? <Text style={styles.noteText}>{note.note}</Text> : null}
            </View>
          ) : (
            <Text style={styles.emptyText}>点击编辑添加备注</Text>
          )}
        </Card.Content>
      </Card>

      {/* 快捷操作 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>快捷操作</Text>
          <Divider style={styles.divider} />
          
          <View style={styles.actionsGrid}>
            <Button
              mode="contained"
              icon="wifi-find"
              onPress={handlePing}
              loading={pinging}
              style={styles.actionBtn}
            >
              Ping
            </Button>
            
            <Button
              mode="outlined"
              icon="web"
              onPress={() => openHTTP(device.ip)}
              style={styles.actionBtn}
            >
              HTTP
            </Button>
            
            <Button
              mode="outlined"
              icon="lock"
              onPress={() => openHTTPS(device.ip)}
              style={styles.actionBtn}
            >
              HTTPS
            </Button>
          </View>
        </Card.Content>
      </Card>

      {/* 开放端口 */}
      {device.openPorts && device.openPorts.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>开放端口</Text>
            <Divider style={styles.divider} />
            <View style={styles.portsGrid}>
              {device.openPorts.map((port: number) => (
                <Chip key={port} mode="outlined" style={styles.portChip}>
                  {port}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}

      {/* 备注编辑弹窗 */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setNoteModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.modalTitle}>编辑备注 - {device.ip}</Text>

            <Text style={styles.modalLabel}>标签名</Text>
            <TextInput
              style={styles.modalInput}
              value={note.name}
              onChangeText={(t) => setNote({ ...note, name: t })}
              placeholder="如：测试服务器"
              maxLength={20}
            />

            <Text style={styles.modalLabel}>标签颜色</Text>
            <View style={styles.colorRow}>
              {NOTE_COLORS.map((c) => (
                <Pressable
                  key={c.value || 'none'}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c.value || '#fff', borderWidth: c.value ? 0 : 1, borderColor: '#ccc' },
                    note.color === c.value && styles.colorDotActive,
                  ]}
                  onPress={() => setNote({ ...note, color: c.value })}
                />
              ))}
            </View>

            <Text style={styles.modalLabel}>备注</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              value={note.note}
              onChangeText={(t) => setNote({ ...note, note: t })}
              placeholder="备注内容..."
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <Button mode="text" onPress={() => setNoteModalVisible(false)}>取消</Button>
              {(note.name || note.note) && (
                <Button mode="text" textColor="#f56c6c" onPress={handleDeleteNote}>清除</Button>
              )}
              <Button mode="contained" onPress={handleSaveNote}>保存</Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa'
  },
  card: {
    margin: 12,
    marginBottom: 8
  },
  ipTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#303133',
    fontFamily: 'monospace',
    marginBottom: 16
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8
  },
  label: {
    fontSize: 14,
    color: '#909399'
  },
  value: {
    fontSize: 14,
    color: '#303133',
    fontFamily: 'monospace'
  },
  statusChip: {
    backgroundColor: '#f4f4f5'
  },
  onlineChip: {
    backgroundColor: '#f0f9eb'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8
  },
  divider: {
    marginBottom: 12
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  actionBtn: {
    flex: 1,
    minWidth: 100
  },
  portsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  portChip: {
    marginBottom: 4
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  noteChip: {
    alignSelf: 'flex-start',
    marginBottom: 4
  },
  noteText: {
    fontSize: 13,
    color: '#606266',
    marginTop: 4
  },
  emptyText: {
    fontSize: 13,
    color: '#c0c4cc'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16
  },
  modalLabel: {
    fontSize: 13,
    color: '#909399',
    marginTop: 12,
    marginBottom: 6
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#dcdfe6',
    borderRadius: 8,
    padding: 10,
    fontSize: 14
  },
  modalTextArea: {
    height: 80,
    textAlignVertical: 'top'
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: '#409eff'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20
  }
})
