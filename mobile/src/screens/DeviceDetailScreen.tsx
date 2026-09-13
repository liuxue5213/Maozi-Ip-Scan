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
  Chip,
  Icon,
  useTheme
} from 'react-native-paper'
import { useRoute, RouteProp } from '@react-navigation/native'
import { getNote, saveNote, deleteNote, NOTE_COLORS, DeviceNote } from '../services/notes'
import { pingHost, getServiceName } from '../services/scanner'
import { getDeviceIcon } from '../services/network'
import type { PortDetail, DeviceInfo } from '../services/network'
import type { RootStackParamList } from '../../App'

type DeviceDetailRouteProp = RouteProp<RootStackParamList, 'DeviceDetail'>

// 端口状态对应的颜色（bg 取半透明，兼容明暗两种主题）
const STATE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: 'rgba(46,125,50,0.18)', text: '#66bb6a', label: '开放' },
  closed: { bg: 'rgba(198,40,40,0.15)', text: '#ef5350', label: '关闭' },
  filtered: { bg: 'rgba(230,81,0,0.15)', text: '#ffa726', label: '过滤' },
}

export default function DeviceDetailScreen() {
  const route = useRoute<DeviceDetailRouteProp>()
  const { colors } = useTheme()
  const { device } = route.params as { device: DeviceInfo }
  const [pinging, setPinging] = useState(false)
  const [noteModalVisible, setNoteModalVisible] = useState(false)
  const [note, setNote] = useState<DeviceNote>({ ip: device.ip, mac: device.mac, name: '', note: '', color: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNote()
  }, [])

  const loadNote = async () => {
    const saved = await getNote(device.mac, device.ip)
    if (saved) {
      setNote({ mac: device.mac, ...saved })
    }
    setLoading(false)
  }

  const openNoteModal = () => {
    setNoteModalVisible(true)
  }

  const handleSaveNote = async () => {
    await saveNote({ ...note, ip: device.ip, mac: device.mac })
    setNoteModalVisible(false)
  }

  const handleDeleteNote = async () => {
    await deleteNote(device.mac, device.ip)
    setNote({ ip: device.ip, mac: device.mac, name: '', note: '', color: '' })
    setNoteModalVisible(false)
  }

  const handlePing = async () => {
    setPinging(true)
    try {
      const online = await pingHost(device.ip)
      Alert.alert('Ping 结果', online ? `${device.ip} 在线` : `${device.ip} 不在线`)
    } finally {
      setPinging(false)
    }
  }

  const openHTTP = (ip: string, port?: number) => {
    const url = port ? `http://${ip}:${port}` : `http://${ip}`
    Linking.openURL(url).catch(() => Alert.alert('错误', '无法打开浏览器'))
  }

  const openHTTPS = (ip: string, port?: number) => {
    const url = port ? `https://${ip}:${port}` : `https://${ip}`
    Linking.openURL(url).catch(() => Alert.alert('错误', '无法打开浏览器'))
  }

  // 统计端口状态
  const openPorts = device.ports?.filter((p: PortDetail) => p.state === 'open') || []
  const filteredPorts = device.ports?.filter((p: PortDetail) => p.state === 'filtered') || []
  const closedPorts = device.ports?.filter((p: PortDetail) => p.state === 'closed') || []

  const hasType = device.deviceType && device.deviceType !== 'Unknown'

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 设备标题卡片 */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.titleRow}>
            <Icon
              source={getDeviceIcon(device.deviceType)}
              size={32}
              color={hasType ? colors.primary : colors.onSurfaceVariant}
            />
            <Text style={[styles.ipTitle, { color: colors.onSurface }]}>{device.ip}</Text>
          </View>

          {/* 主机名 / 标签 */}
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>名称</Text>
            <Text style={[styles.value, { color: colors.onSurface }]}>
              {note.name || device.hostname || '(无)'}
            </Text>
          </View>

          {/* MAC */}
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>MAC 地址</Text>
            <Text style={[styles.value, { color: colors.onSurface }]}>{device.mac || 'N/A'}</Text>
          </View>

          {/* 厂商 */}
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>厂商</Text>
            <Text style={[styles.value, { color: colors.onSurface }]}>{device.vendor || 'Unknown'}</Text>
          </View>

          {/* 推断的设备类型 */}
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>设备类型</Text>
            <Text style={[styles.value, { color: colors.onSurface }]}>{device.deviceType || 'Unknown'}</Text>
          </View>

          {/* 推断的操作系统 */}
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>操作系统</Text>
            <Text style={[styles.value, { color: colors.onSurface }]}>{device.osName || 'Unknown'}</Text>
          </View>

          {/* 状态 */}
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>状态</Text>
            <Chip mode="flat" compact style={[styles.onlineChip, { backgroundColor: 'rgba(46,125,50,0.18)' }]}>
              <Text style={{ color: '#66bb6a' }}>在线</Text>
            </Chip>
          </View>

          {/* 发现方式 */}
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>发现方式</Text>
            <Chip mode="outlined" compact>{device.source}</Chip>
          </View>
        </Card.Content>
      </Card>

      {/* 备注 */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.noteHeader}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>备注</Text>
            <IconButton icon="pencil" size={20} onPress={openNoteModal} />
          </View>
          <Divider style={styles.divider} />
          {!loading && (note.name || note.note) ? (
            <View>
              {note.name ? (
                <Chip
                  mode="flat"
                  style={[styles.noteChip, note.color ? { backgroundColor: note.color + '26' } : undefined]}
                  textStyle={note.color ? { color: note.color } : undefined}
                >
                  {note.name}
                </Chip>
              ) : null}
              {note.note ? <Text style={[styles.noteText, { color: colors.onSurfaceVariant }]}>{note.note}</Text> : null}
            </View>
          ) : (
            <Text style={[styles.emptyHint, { color: colors.outline }]}>点击编辑添加备注</Text>
          )}
        </Card.Content>
      </Card>

      {/* 端口扫描结果 */}
      {device.ports && device.ports.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
              端口扫描 ({openPorts.length} 开放 / {filteredPorts.length} 过滤 / {closedPorts.length} 关闭)
            </Text>
            <Divider style={styles.divider} />

            {/* 开放端口（重点展示） */}
          {openPorts.length > 0 && (
            <View style={styles.portSection}>
              <Text style={[styles.portSectionTitle, { color: colors.onSurfaceVariant }]}>开放端口</Text>
              <View style={styles.portsGrid}>
                {openPorts.map((port: PortDetail) => (
                  <PortChip key={port.port} port={port} />
                ))}
              </View>
            </View>
          )}

          {/* 过滤端口 */}
          {filteredPorts.length > 0 && (
            <View style={styles.portSection}>
              <Text style={[styles.portSectionTitle, { color: colors.onSurfaceVariant }]}>过滤端口</Text>
              <View style={styles.portsGrid}>
                {filteredPorts.map((port: PortDetail) => (
                  <PortChip key={port.port} port={port} />
                ))}
              </View>
            </View>
          )}

            {/* 关闭端口（可折叠，这里简略显示数量） */}
            {closedPorts.length > 0 && (
              <Text style={[styles.closedHint, { color: colors.onSurfaceVariant }]}>另有 {closedPorts.length} 个关闭端口</Text>
            )}
          </Card.Content>
        </Card>
      )}

      {/* 快捷操作 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>快捷操作</Text>
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

          {/* 常用端口快捷跳转 */}
          {openPorts.length > 0 && (
            <View style={styles.portQuickActions}>
              <Text style={[styles.portSectionTitle, { color: colors.onSurfaceVariant }]}>访问开放服务</Text>
              <View style={styles.portsGrid}>
                {openPorts.slice(0, 8).map((p: PortDetail) => (
                  <Chip
                    key={p.port}
                    mode="outlined"
                    compact
                    onPress={() => {
                      const isSecure = [443, 8443, 993, 995].includes(p.port)
                      isSecure ? openHTTPS(device.ip, p.port) : openHTTP(device.ip, p.port)
                    }}
                    style={styles.portQuickChip}
                  >
                    {p.port}/{p.service}
                  </Chip>
                ))}
              </View>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* 备注编辑弹窗 */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setNoteModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation?.()}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>编辑备注 - {device.ip}</Text>

            <Text style={[styles.modalLabel, { color: colors.onSurfaceVariant }]}>标签名</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.outline, color: colors.onSurface }]}
              value={note.name}
              onChangeText={(t) => setNote({ ...note, name: t })}
              placeholder="如：测试服务器"
              placeholderTextColor={colors.outline}
              maxLength={20}
            />

            <Text style={[styles.modalLabel, { color: colors.onSurfaceVariant }]}>标签颜色</Text>
            <View style={styles.colorRow}>
              {NOTE_COLORS.map((c) => (
                <Pressable
                  key={c.value || 'none'}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c.value || colors.surface, borderWidth: c.value ? 0 : 1, borderColor: colors.outline },
                    note.color === c.value && styles.colorDotActive,
                  ]}
                  onPress={() => setNote({ ...note, color: c.value })}
                />
              ))}
            </View>

            <Text style={[styles.modalLabel, { color: colors.onSurfaceVariant }]}>备注</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea, { borderColor: colors.outline, color: colors.onSurface }]}
              value={note.note}
              onChangeText={(t) => setNote({ ...note, note: t })}
              placeholder="备注内容..."
              placeholderTextColor={colors.outline}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <Button mode="text" onPress={() => setNoteModalVisible(false)}>取消</Button>
              {(note.name || note.note) && (
                <Button mode="text" textColor="#ef5350" onPress={handleDeleteNote}>清除</Button>
              )}
              <Button mode="contained" onPress={handleSaveNote}>保存</Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  )
}

// 端口状态 chip 组件
function PortChip({ port }: { port: PortDetail }) {
  const color = STATE_COLORS[port.state] || STATE_COLORS.filtered
  return (
    <View style={[styles.portChipWrapper, { backgroundColor: color.bg }]}>
      <Text style={[styles.portChipText, { color: color.text }]}>
        {port.port}
      </Text>
      <Text style={[styles.portChipService, { color: color.text }]}>
        {port.service || getServiceName(port.port)}
      </Text>
      {port.banner ? (
        <Text style={[styles.portChipBanner, { color: color.text }]} numberOfLines={1}>
          {port.banner}
        </Text>
      ) : null}
      <Text style={[styles.portChipState, { color: color.text }]}>
        {color.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  card: {
    margin: 12,
    marginBottom: 8
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10
  },
  ipTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'monospace'
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8
  },
  label: {
    fontSize: 14
  },
  value: {
    fontSize: 14,
    fontFamily: 'monospace'
  },
  onlineChip: {},
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
    marginTop: 4
  },
  emptyHint: {
    fontSize: 13
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8
  },
  divider: {
    marginBottom: 12
  },
  portSection: {
    marginBottom: 12
  },
  portSectionTitle: {
    fontSize: 13,
    marginBottom: 6
  },
  portsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  portChipWrapper: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center'
  },
  portChipText: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace'
  },
  portChipService: {
    fontSize: 10,
    fontFamily: 'monospace'
  },
  portChipBanner: {
    fontSize: 9,
    maxWidth: 80
  },
  portChipState: {
    fontSize: 9,
    fontWeight: 'bold'
  },
  closedHint: {
    fontSize: 12,
    fontStyle: 'italic'
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
  portQuickActions: {
    marginTop: 16
  },
  portQuickChip: {
    marginBottom: 4
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24
  },
  modalContent: {
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
    marginTop: 12,
    marginBottom: 6
  },
  modalInput: {
    borderWidth: 1,
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
