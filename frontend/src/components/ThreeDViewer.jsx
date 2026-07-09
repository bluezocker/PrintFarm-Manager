import { useEffect, useRef, useState } from 'react'
import { X, RotateCw, Maximize2, Loader2 } from 'lucide-react'
import * as THREE from 'three'
import api from '../services/api'

// STLLoader implementation inline (kompakt, für Browser)
function parseSTL(data) {
  const reader = new DataView(data)
  const isBinary = () => {
    const bytes = new Uint8Array(data, 0, 5)
    const header = String.fromCharCode(...bytes)
    if (header === 'solid') {
      // Check byte-count vs actual size
      if (reader.byteLength < 84) return true
      const triangles = reader.getUint32(80, true)
      const expected = 84 + triangles * 50
      return expected === reader.byteLength
    }
    return true
  }

  const parseBinary = () => {
    const triangles = reader.getUint32(80, true)
    const geometry = new THREE.BufferGeometry()
    const vertices = new Float32Array(triangles * 9)
    const normals = new Float32Array(triangles * 9)
    let offset = 84
    for (let i = 0; i < triangles; i++) {
      const nx = reader.getFloat32(offset, true)
      const ny = reader.getFloat32(offset + 4, true)
      const nz = reader.getFloat32(offset + 8, true)
      for (let j = 0; j < 3; j++) {
        const vOffset = offset + 12 + j * 12
        const vi = i * 9 + j * 3
        vertices[vi] = reader.getFloat32(vOffset, true)
        vertices[vi + 1] = reader.getFloat32(vOffset + 4, true)
        vertices[vi + 2] = reader.getFloat32(vOffset + 8, true)
        normals[vi] = nx
        normals[vi + 1] = ny
        normals[vi + 2] = nz
      }
      offset += 50
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    return geometry
  }

  const parseASCII = () => {
    const text = new TextDecoder().decode(data)
    const positions = []
    const normals = []
    const facetRegex = /facet\s+normal\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)[\s\S]*?vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g
    let match
    while ((match = facetRegex.exec(text)) !== null) {
      const [, nx, ny, nz, v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z] = match.map(Number)
      positions.push(v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z)
      for (let i = 0; i < 3; i++) normals.push(nx, ny, nz)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
    return geometry
  }

  return isBinary() ? parseBinary() : parseASCII()
}

// Extrahiert das Model aus einer 3MF-Datei (ZIP mit .model XML drin)
// Entpackt eine einzelne Datei aus dem 3MF-ZIP.
// method 0 = stored, method 8 = deflate
async function inflateEntry(arrayBuffer, entry) {
  const compressed = new Uint8Array(arrayBuffer, entry.dataOffset, entry.compressedSize)
  if (entry.method === 0) {
    return compressed
  }
  if (entry.method === 8) {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const chunks = []
    const reader = stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const total = chunks.reduce((s, c) => s + c.length, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { out.set(c, off); off += c.length }
    return out
  }
  throw new Error(`Unbekannte ZIP-Kompression: ${entry.method}`)
}

// Liest das ZIP-Verzeichnis und gibt alle Einträge mit ihren Header-Infos zurück.
function readZipEntries(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  const entries = []

  // End Of Central Directory Record suchen
  let eocdOffset = -1
  const maxSearch = Math.min(arrayBuffer.byteLength, 65536)
  for (let i = arrayBuffer.byteLength - 22; i >= arrayBuffer.byteLength - maxSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) throw new Error('Kein ZIP-EOCD gefunden')

  const numEntries = view.getUint16(eocdOffset + 10, true)
  const cdOffset = view.getUint32(eocdOffset + 16, true)

  let cursor = cdOffset
  for (let i = 0; i < numEntries; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const fileNameLen = view.getUint16(cursor + 28, true)
    const extraLen = view.getUint16(cursor + 30, true)
    const commentLen = view.getUint16(cursor + 32, true)
    const localHeaderOffset = view.getUint32(cursor + 42, true)
    const nameBytes = new Uint8Array(arrayBuffer, cursor + 46, fileNameLen)
    const name = new TextDecoder().decode(nameBytes)

    // Local Header lesen um echten Daten-Offset zu bestimmen
    const lh = localHeaderOffset
    if (view.getUint32(lh, true) === 0x04034b50) {
      const lhFileNameLen = view.getUint16(lh + 26, true)
      const lhExtraLen = view.getUint16(lh + 28, true)
      const dataOffset = lh + 30 + lhFileNameLen + lhExtraLen
      entries.push({ name, method, compressedSize, uncompressedSize, dataOffset })
    }
    cursor += 46 + fileNameLen + extraLen + commentLen
  }
  return entries
}

// Findet ALLE .model-Dateien im 3MF und entpackt sie.
// Bambu-Slicer legt Objekte oft in separate Dateien unter 3D/Objects/ ab.
async function extract3mfModels(arrayBuffer) {
  const entries = readZipEntries(arrayBuffer)
  const modelEntries = entries.filter(e => e.name.toLowerCase().endsWith('.model'))
  if (modelEntries.length === 0) {
    throw new Error('Keine .model-Datei in 3MF gefunden')
  }

  // Root-Model zuerst (3D/3dmodel.model), dann alles andere
  modelEntries.sort((a, b) => {
    const aRoot = /3d\/3dmodel\.model$/i.test(a.name) ? 0 : 1
    const bRoot = /3d\/3dmodel\.model$/i.test(b.name) ? 0 : 1
    return aRoot - bRoot
  })

  const xmls = []
  for (const entry of modelEntries) {
    try {
      const bytes = await inflateEntry(arrayBuffer, entry)
      xmls.push({ name: entry.name, xml: new TextDecoder().decode(bytes) })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`3MF: Kann ${entry.name} nicht entpacken:`, e)
    }
  }
  return xmls
}

// Parst 3MF-XML zu einer BufferGeometry.
// Namespace-blind (nutzt getElementsByTagName statt querySelector),
// damit auch der Bambu-Namespace erkannt wird.
function parse3mfXml(xml) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  // Parse-Fehler?
  const parseErr = doc.getElementsByTagName('parsererror')
  if (parseErr.length) {
    throw new Error('3MF-XML konnte nicht geparst werden')
  }

  // Namespace-blind: getElementsByTagName ignoriert Prefixes
  const meshes = doc.getElementsByTagName('mesh')
  if (!meshes.length) return null

  const positions = []
  const indices = []

  for (const mesh of meshes) {
    const verticesEl = mesh.getElementsByTagName('vertices')[0]
    const trianglesEl = mesh.getElementsByTagName('triangles')[0]
    if (!verticesEl || !trianglesEl) continue

    const verts = verticesEl.getElementsByTagName('vertex')
    const startIdx = positions.length / 3
    for (const v of verts) {
      positions.push(
        parseFloat(v.getAttribute('x')) || 0,
        parseFloat(v.getAttribute('y')) || 0,
        parseFloat(v.getAttribute('z')) || 0,
      )
    }
    const tris = trianglesEl.getElementsByTagName('triangle')
    for (const t of tris) {
      indices.push(
        startIdx + parseInt(t.getAttribute('v1'), 10),
        startIdx + parseInt(t.getAttribute('v2'), 10),
        startIdx + parseInt(t.getAttribute('v3'), 10),
      )
    }
  }

  if (positions.length === 0 || indices.length === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// Sucht in allen .model-Dateien nach dem ersten mit tatsächlichen Meshes.
async function parseFirst3mfWithMesh(arrayBuffer) {
  const xmls = await extract3mfModels(arrayBuffer)
  const tried = []
  for (const { name, xml } of xmls) {
    try {
      const geom = parse3mfXml(xml)
      if (geom) {
        // eslint-disable-next-line no-console
        console.log(`3MF: Meshes gefunden in ${name}`)
        return geom
      }
      tried.push(name)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`3MF: Parse-Fehler in ${name}:`, e)
      tried.push(name)
    }
  }
  throw new Error(
    `Kein Mesh in 3MF gefunden. Geprüfte Dateien: ${tried.join(', ') || '—'}. ` +
    `Möglicherweise verwendet die Datei ein Format, das noch nicht unterstützt wird.`
  )
}

/**
 * 3D-Viewer-Komponente
 *
 * Zeigt STL/3MF-Dateien im Browser als 3D-Modell.
 * Nutzt Three.js mit einfacher OrbitControl.
 */
export default function ThreeDViewer({ fileId, fileType, onClose, filename }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!containerRef.current) return

    let animationFrame = null
    let cancelled = false

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf3f4f6)

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 5000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    // Beleuchtung
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(1, 1, 1)
    scene.add(dirLight)
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3)
    dirLight2.position.set(-1, -1, -1)
    scene.add(dirLight2)

    // Grid + Achsen
    const gridHelper = new THREE.GridHelper(200, 20, 0xcccccc, 0xe5e7eb)
    scene.add(gridHelper)

    // Simple Orbit Controls (ohne extra Package)
    let mesh = null
    let isDragging = false
    let prevX = 0, prevY = 0
    let cameraDistance = 100
    let cameraAzimuth = Math.PI / 4
    let cameraPolar = Math.PI / 3
    let target = new THREE.Vector3(0, 0, 0)

    const updateCameraPosition = () => {
      camera.position.x = target.x + cameraDistance * Math.sin(cameraPolar) * Math.cos(cameraAzimuth)
      camera.position.y = target.y + cameraDistance * Math.cos(cameraPolar)
      camera.position.z = target.z + cameraDistance * Math.sin(cameraPolar) * Math.sin(cameraAzimuth)
      camera.lookAt(target)
    }

    const onMouseDown = (e) => {
      isDragging = true
      prevX = e.clientX; prevY = e.clientY
    }
    const onMouseUp = () => { isDragging = false }
    const onMouseMove = (e) => {
      if (!isDragging) return
      const dx = e.clientX - prevX
      const dy = e.clientY - prevY
      cameraAzimuth -= dx * 0.01
      cameraPolar = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPolar - dy * 0.01))
      prevX = e.clientX; prevY = e.clientY
      updateCameraPosition()
    }
    const onWheel = (e) => {
      e.preventDefault()
      cameraDistance = Math.max(10, Math.min(2000, cameraDistance * (1 + e.deltaY * 0.001)))
      updateCameraPosition()
    }

    renderer.domElement.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    // Touch events
    let touchDist = 0
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDragging = true
        prevX = e.touches[0].clientX
        prevY = e.touches[0].clientY
      } else if (e.touches.length === 2) {
        touchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      }
    }
    const onTouchMove = (e) => {
      e.preventDefault()
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - prevX
        const dy = e.touches[0].clientY - prevY
        cameraAzimuth -= dx * 0.01
        cameraPolar = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPolar - dy * 0.01))
        prevX = e.touches[0].clientX
        prevY = e.touches[0].clientY
        updateCameraPosition()
      } else if (e.touches.length === 2) {
        const newDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
        cameraDistance = Math.max(10, Math.min(2000, cameraDistance * (touchDist / newDist)))
        touchDist = newDist
        updateCameraPosition()
      }
    }
    const onTouchEnd = () => { isDragging = false }
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false })
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false })
    renderer.domElement.addEventListener('touchend', onTouchEnd)

    updateCameraPosition()

    // Render Loop
    const animate = () => {
      if (cancelled) return
      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(animate)
    }
    animate()

    // Resize
    const onResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // Datei laden
    api.get(`/library/${fileId}/download`, { responseType: 'arraybuffer' })
      .then(async (r) => {
        if (cancelled) return
        try {
          let geometry
          if (fileType === 'stl') {
            geometry = parseSTL(r.data)
          } else if (fileType === '3mf') {
            geometry = await parseFirst3mfWithMesh(r.data)
          } else {
            throw new Error(`Dateityp ${fileType} nicht unterstützt für 3D-Vorschau`)
          }

          geometry.computeBoundingBox()
          const box = geometry.boundingBox
          const size = new THREE.Vector3()
          box.getSize(size)
          const center = new THREE.Vector3()
          box.getCenter(center)

          // Model zentrieren und rotieren (Bambu-Slicer speichert Z-up, Three.js ist Y-up)
          geometry.translate(-center.x, -center.y, -center.z)

          const material = new THREE.MeshPhongMaterial({
            color: 0x3b82f6,
            specular: 0x111111,
            shininess: 30,
            flatShading: false,
          })
          mesh = new THREE.Mesh(geometry, material)

          // Y-up in Three.js: Bambu ist Z-up, also X rotieren
          mesh.rotation.x = -Math.PI / 2
          scene.add(mesh)

          // Kamera auf sinnvolle Distanz
          const maxDim = Math.max(size.x, size.y, size.z)
          cameraDistance = maxDim * 2.5
          updateCameraPosition()

          setInfo({
            width: size.x.toFixed(1),
            depth: size.y.toFixed(1),
            height: size.z.toFixed(1),
            triangles: (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3,
          })
          setLoading(false)
        } catch (e) {
          setError(e.message || 'Fehler beim Parsen')
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.response?.data?.detail || e.message || 'Datei konnte nicht geladen werden')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      if (animationFrame) cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('mousedown', onMouseDown)
      renderer.domElement.removeEventListener('wheel', onWheel)
      renderer.domElement.removeEventListener('touchstart', onTouchStart)
      renderer.domElement.removeEventListener('touchmove', onTouchMove)
      renderer.domElement.removeEventListener('touchend', onTouchEnd)
      if (mesh) {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [fileId, fileType])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">3D-Vorschau: {filename}</h3>
            {info && (
              <p className="text-xs text-gray-500">
                {info.width} × {info.depth} × {info.height} mm ·  {info.triangles.toLocaleString('de-DE')} Dreiecke
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative flex-1 min-h-[400px]" ref={containerRef}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600 mb-2" />
                <p className="text-sm text-gray-600">Lade 3D-Modell...</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center max-w-md p-4">
                <p className="text-red-700 mb-2">Fehler:</p>
                <p className="text-sm text-gray-600">{error}</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500 flex items-center justify-between">
          <div>🖱️ Ziehen zum Drehen · Scrollen zum Zoomen</div>
          <div>Powered by Three.js</div>
        </div>
      </div>
    </div>
  )
}
