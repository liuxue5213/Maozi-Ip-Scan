import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl
} from 'react-native'
import {
  Button,
  Card,
  Chip,
  ProgressBar,
  FAB,
  IconButton,
  Badge
} from 'react-native-paper'
import Clipboard from '@react-native-clipboard/clipboard'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { getNetworkInfo, generateCIDR, NetworkInfo, DeviceInfo } from '../services/network'
import { scanNetwork, readArpTable } from '../services/scanner'
import type { RootStackParamList } from '../../App'

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function ScanScreen() {
  const navigation = useNavigation<NavigationProp>()
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null)
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [cidr, setCidr] = useState('192.168.1.0/24')
  const [modes] = useState(['arp', 'icmp'])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadNetworkInfo()
  }, [])

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

  const handleScan = useCallback(async () => {
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
          setDevices(prev => [...prev, device])
        }
      )
      setDevices(results)
    } catch (e) {
      Alert.alert('扫描失败', String(e))
    } finally {
      setScanning(false)
      setProgress(0)
    }
  }, [cidr, modes])

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

  const renderDevice = ({ item }: { item: DeviceInfo }) => (
    <Card style={styles.deviceCard}>
      <TouchableOpacity
        onPress={() => navigation.navigate('DeviceDetail', { device: item })}
      >
        <Card.Content>
          <View style={styles.deviceHeader}>
            <Text style={styles.deviceIP}>{item.ip}</Text>
            <View style={styles.deviceActions}>
              <IconButton
                icon="content-copy"
                size={16}
                onPress={() => copyIP(item.ip)}
              />
              <Chip mode="outlined" compact>{item.source}</Chip>
            </View>
          </View>
          {item.mac ? (
            <Text style={styles.deviceMAC}>MAC: {item.mac}</Text>
          ) : null}
          {item.vendor ? (
            <Text style={styles.deviceVendor}>🏷️ {item.vendor}</Text>
          ) : null}
          {item.hostname ? (
            <Text style={styles.deviceHostname}>🖥️ {item.hostname}</Text>
          ) : null}
        </Card.Content>
      </TouchableOpacity>
    </Card>
  )

  return (
    <View style={styles.container}>
      {/* 网络信息卡片 */}
      <Card style={styles.networkCard}>
        <Card.Content>
          <Text style={styles.cardTitle}>📡 当前网络</Text>
          {networkInfo ? (
            <>
              <Text style={styles.networkText}>
                SSID: {networkInfo.ssid || 'N/A'}
              </Text>
              <Text style={styles.networkText}>
                IP: {networkInfo.ipAddress || 'N/A'}
              </Text>
              <Text style={styles.networkText}>
                类型: {networkInfo.type}
              </Text>
            </>
          ) : (
            <Text style={styles.networkText}>加载中...</Text>
          )}
          <Chip icon="wan" mode="outlined" style={styles.cidrChip}>
            {cidr}
          </Chip>
        </Card.Content>
      </Card>

      {/* 扫描进度 */}
      {scanning && (
        <View style={styles.progressContainer}>
          <ProgressBar progress={progress} color="#667eea" />
          <Text style={styles.progressText}>
            扫描中... {Math.round(progress * 100)}%
          </Text>
        </View>
      )}

      {/* 设备统计 */}
      <View style={styles.statsRow}>
        <Badge style={styles.badge}>{devices.length}</Badge>
        <Text style={styles.statsText}>台设备已发现</Text>
        <Button
          mode="text"
          onPress={handleRefresh}
          disabled={refreshing}
          icon="refresh"
        >
          刷新
        </Button>
      </View>

      {/* 设备列表 */}
      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.ip}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {scanning ? '正在扫描局域网...' : '点击下方按钮开始扫描'}
            </Text>
          </View>
        }
      />

      {/* 扫描按钮 */}
      <FAB
        icon={scanning ? 'stop' : 'magnify-scan'}
        label={scanning ? '停止' : '开始扫描'}
        style={styles.fab}
        onPress={handleScan}
        color="#ffffff"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa'
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
    color: '#606266',
    marginBottom: 2
  },
  cidrChip: {
    alignSelf: 'flex-start',
    marginTop: 8
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  progressText: {
    textAlign: 'center',
    marginTop: 4,
    fontSize: 12,
    color: '#909399'
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4
  },
  badge: {
    backgroundColor: '#667eea',
    marginRight: 8
  },
  statsText: {
    flex: 1,
    fontSize: 13,
    color: '#909399'
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
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  deviceIP: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#303133',
    fontFamily: 'monospace'
  },
  deviceActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  deviceMAC: {
    fontSize: 12,
    color: '#909399',
    fontFamily: 'monospace',
    marginTop: 4
  },
  deviceVendor: {
    fontSize: 13,
    color: '#667eea',
    marginTop: 2
  },
  deviceHostname: {
    fontSize: 13,
    color: '#606266',
    marginTop: 2
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60
  },
  emptyText: {
    fontSize: 14,
    color: '#c0c4cc'
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#667eea'
  }
})
