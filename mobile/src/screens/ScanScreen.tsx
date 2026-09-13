import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  PermissionsAndroid,
  Platform
} from 'react-native'
import {
  Button,
  Card,
  Chip,
  ProgressBar,
  FAB,
  IconButton,
  Badge,
  Switch,
  Searchbar,
  Icon,
  useTheme
} from 'react-native-paper'
import Clipboard from '@react-native-clipboard/clipboard'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { getNetworkInfo, generateCIDR, NetworkInfo, DeviceInfo, getDeviceIcon } from '../services/network'
import { scanNetwork, readArpTable, ScanCancel } from '../services/scanner'
import { getAllNotes, noteKey } from '../services/notes'
import type { RootStackParamList } from '../../App'

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

// IP 数字排序（避免 192.168.1.10 排在 192.168.1.2 前面的字符串序问题）
function compareIP(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 4; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

export default function ScanScreen() {
  const navigation = useNavigation<NavigationProp>()
  const { colors } = useTheme()
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null)
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [cidr, setCidr] = useState('192.168.1.0/24')
  const [modes] = useState(['arp', 'icmp'])
  const [portScan, setPortScan] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState<Record<string, { name: string; color: string }>>({})
  const cancelRef = useRef<ScanCancel | null>(null)

  useEffect(() => {
    initPermissionsAndNetwork()
  }, [])

  // 每次回到本页时刷新备注（详情页可能刚编辑过）
  useEffect(() => {
    const unsub = navigation.addListener('focus', loadNotes)
    return unsub
  }, [navigation])

  // Android 10+ 读取 WiFi 名称(SSID)需要定位权限，启动时申请
  const initPermissionsAndNetwork = async () => {
    try {
      if (Platform.OS === 'android' && Platform.Version >= 29) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: '位置权限申请',
            message: '读取 WiFi 名称(SSID)需要定位权限。\n拒绝不影响扫描功能，仅 WiFi 名称会显示为 N/A。',
            buttonPositive: '允许',
            buttonNegative: '拒绝'
          }
        )
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Location permission denied, SSID will be unavailable')
        }
      }
    } catch (e) {
      console.warn('Request location permission failed:', e)
    }
    await loadNetworkInfo()
  }

  const loadNetworkInfo = async () => {
    try {
      const info = await getNetworkInfo()
      setNetworkInfo(info)
      if (info.ipAddress) {
        setCidr(generateCIDR(info.ipAddress))
      }
    } catch (e) {
      console.warn('Load network info failed:', e)
    }
  }

  const loadNotes = async () => {
    try {
      const all = await getAllNotes()
      const mapped: Record<string, { name: string; color: string }> = {}
      Object.entries(all).forEach(([key, n]) => {
        if (n.name || n.note) {
          mapped[key] = { name: n.name, color: n.color }
        }
      })
      setNotes(mapped)
    } catch (e) {
      console.warn('Load notes failed:', e)
    }
  }

  const handleScan = useCallback(async () => {
    // 正在扫描时点击 = 停止
    if (scanning) {
      if (cancelRef.current) {
        cancelRef.current.cancelled = true
      }
      return
    }

    const cancel = new ScanCancel()
    cancelRef.current = cancel
    setScanning(true)
    setProgress(0)
    setDevices([])

    try {
      const results = await scanNetwork(
        cidr,
        modes,
        (current, total) => {
          setProgress(Math.min(current / total, 1))
        },
        (device) => {
          setDevices(prev =>
            prev.some(p => p.ip === device.ip) ? prev : [...prev, device]
          )
        },
        portScan,
        cancel
      )
      setDevices(results)
      if (cancel.cancelled) {
        Alert.alert('已停止', `扫描已取消，共发现 ${results.length} 台设备`)
      }
    } catch (e) {
      Alert.alert('扫描失败', String(e))
    } finally {
      setScanning(false)
      setProgress(0)
      cancelRef.current = null
    }
  }, [cidr, modes, portScan, scanning])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadNetworkInfo()
    // 快速 ARP 扫描
    const arpDevices = await readArpTable()
    setDevices(arpDevices)
    setRefreshing(false)
  }

  const copyIP = (ip: string) => {
    Clipboard.setString(ip)
    Alert.alert('已复制', ip)
  }

  // 搜索过滤（IP / MAC / 主机名 / 厂商 / 设备类型 / 备注名）
  const filteredDevices = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const list = keyword
      ? devices.filter(d => {
          const note = notes[noteKey(d.mac, d.ip)]
          return [
            d.ip, d.mac, d.hostname, d.vendor, d.deviceType,
            note?.name
          ].some(v => v && v.toLowerCase().includes(keyword))
        })
      : devices
    return [...list].sort((a, b) => compareIP(a.ip, b.ip))
  }, [devices, search, notes])

  const renderDevice = ({ item }: { item: DeviceInfo }) => {
    const note = notes[noteKey(item.mac, item.ip)]
    return (
      <Card style={styles.deviceCard}>
        <TouchableOpacity
          onPress={() => navigation.navigate('DeviceDetail', { device: item })}
        >
          <Card.Content>
            <View style={styles.deviceHeader}>
              <View style={styles.deviceIconWrap}>
                <Icon
                  source={getDeviceIcon(item.deviceType)}
                  size={26}
                  color={item.deviceType && item.deviceType !== 'Unknown' ? colors.primary : colors.onSurfaceVariant}
                />
              </View>
              <View style={styles.deviceMain}>
                <Text style={[styles.deviceIP, { color: colors.onSurface }]}>{item.ip}</Text>
                {item.mac ? (
                  <Text style={[styles.deviceMAC, { color: colors.onSurfaceVariant }]}>
                    MAC: {item.mac}
                  </Text>
                ) : null}
                {item.hostname ? (
                  <Text style={[styles.deviceHostname, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                    {item.hostname}
                  </Text>
                ) : null}
                {item.vendor ? (
                  <Text style={[styles.deviceVendor, { color: colors.primary }]} numberOfLines={1}>
                    {item.vendor}
                  </Text>
                ) : null}
                {note?.name ? (
                  <Chip
                    mode="flat"
                    compact
                    style={[styles.noteChip, note.color ? { backgroundColor: note.color + '26' } : { backgroundColor: colors.surfaceVariant }]}
                    textStyle={note.color ? { color: note.color, fontSize: 11 } : { fontSize: 11 }}
                  >
                    {note.name}
                  </Chip>
                ) : null}
              </View>
              <View style={styles.deviceActions}>
                <IconButton
                  icon="content-copy"
                  size={16}
                  onPress={() => copyIP(item.ip)}
                />
                <Chip mode="outlined" compact>{item.source}</Chip>
                {item.deviceType && item.deviceType !== 'Unknown' ? (
                  <Chip mode="flat" compact style={[styles.typeChip, { backgroundColor: colors.primaryContainer }]}>
                    <Text style={[styles.typeChipText, { color: colors.onSurface }]}>{item.deviceType}</Text>
                  </Chip>
                ) : null}
              </View>
            </View>
          </Card.Content>
        </TouchableOpacity>
      </Card>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 网络信息卡片 */}
      <Card style={styles.networkCard} mode="elevated">
        <Card.Content>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>📡 当前网络</Text>
          {networkInfo ? (
            <>
              <Text style={[styles.networkText, { color: colors.onSurfaceVariant }]}>
                SSID: {networkInfo.ssid || 'N/A'}
              </Text>
              <Text style={[styles.networkText, { color: colors.onSurfaceVariant }]}>
                IP: {networkInfo.ipAddress || 'N/A'}
              </Text>
              <Text style={[styles.networkText, { color: colors.onSurfaceVariant }]}>
                类型: {networkInfo.type}
              </Text>
            </>
          ) : (
            <Text style={[styles.networkText, { color: colors.onSurfaceVariant }]}>加载中...</Text>
          )}
          <Chip icon="wan" mode="outlined" style={styles.cidrChip}>
            {cidr}
          </Chip>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.onSurfaceVariant }]}>端口扫描</Text>
            <Switch value={portScan} onValueChange={setPortScan} />
          </View>
        </Card.Content>
      </Card>

      {/* 扫描进度 */}
      {scanning && (
        <View style={styles.progressContainer}>
          <ProgressBar progress={progress} color={colors.primary} />
          <Text style={[styles.progressText, { color: colors.onSurfaceVariant }]}>
            扫描中... {Math.round(progress * 100)}%
          </Text>
        </View>
      )}

      {/* 设备统计 + 搜索 */}
      <View style={styles.statsRow}>
        <Badge style={[styles.badge, { backgroundColor: colors.primary }]}>{devices.length}</Badge>
        <Text style={[styles.statsText, { color: colors.onSurfaceVariant }]}>台设备已发现</Text>
        <Button
          mode="text"
          onPress={handleRefresh}
          disabled={refreshing}
          icon="refresh"
        >
          刷新
        </Button>
      </View>

      <Searchbar
        placeholder="搜索 IP / 主机名 / 厂商 / 备注"
        value={search}
        onChangeText={setSearch}
        style={[styles.searchBar, { backgroundColor: colors.surfaceVariant }]}
        inputStyle={{ color: colors.onSurface }}
        iconColor={colors.onSurfaceVariant}
        elevation={0}
      />

      {/* 设备列表 */}
      <FlatList
        data={filteredDevices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.ip}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.outline }]}>
              {scanning
                ? '正在扫描局域网...'
                : devices.length > 0
                  ? '没有匹配的设备'
                  : '点击下方按钮开始扫描'}
            </Text>
          </View>
        }
      />

      {/* 扫描 / 停止按钮 */}
      <FAB
        icon={scanning ? 'stop' : 'magnify-scan'}
        label={scanning ? '停止' : '开始扫描'}
        style={[styles.fab, { backgroundColor: scanning ? '#e5484d' : colors.primary }]}
        onPress={handleScan}
        color="#ffffff"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  networkCard: {
    margin: 12,
    marginBottom: 8
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8
  },
  networkText: {
    fontSize: 13,
    marginBottom: 2
  },
  cidrChip: {
    alignSelf: 'flex-start',
    marginTop: 8
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12
  },
  switchLabel: {
    fontSize: 14
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  progressText: {
    textAlign: 'center',
    marginTop: 4,
    fontSize: 12
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4
  },
  badge: {
    marginRight: 8
  },
  statsText: {
    flex: 1,
    fontSize: 13
  },
  searchBar: {
    marginHorizontal: 12,
    marginVertical: 4,
    height: 40
  },
  listContent: {
    padding: 12,
    paddingBottom: 80
  },
  deviceCard: {
    marginBottom: 8
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  deviceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2
  },
  deviceMain: {
    flex: 1
  },
  deviceIP: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace'
  },
  deviceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 130
  },
  typeChip: {
    marginLeft: 4
  },
  typeChipText: {
    fontSize: 10
  },
  noteChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    height: 24
  },
  deviceMAC: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2
  },
  deviceVendor: {
    fontSize: 13,
    marginTop: 2
  },
  deviceHostname: {
    fontSize: 13,
    marginTop: 2
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60
  },
  emptyText: {
    fontSize: 14
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16
  }
})
