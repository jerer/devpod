import { Box, Portal, useColorModeValue, useToken } from "@chakra-ui/react"
import { css } from "@emotion/react"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import {
  forwardRef,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Terminal as XTermTerminal, ITheme as IXTermTheme } from "xterm"
import { FitAddon } from "xterm-addon-fit"
import { exists, remToPx } from "../../lib"

type TTerminalRef = Readonly<{
  clear: VoidFunction
  write: (data: string) => void
  writeln: (data: string) => void
}>
type TTerminalProps = Readonly<{ fontSize: string }>
export type TTerminal = TTerminalRef

const TERMINAL_FONT_FAMILY =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", "DejaVu Sans Mono", "Liberation Mono", Menlo, Monaco, Consolas, "Courier New", monospace'
const CONTEXT_MENU_WIDTH = 160
const CONTEXT_MENU_HEIGHT = 36

type TContextMenuState = Readonly<{
  x: number
  y: number
  hasSelection: boolean
}>

export const Terminal = forwardRef<TTerminalRef, TTerminalProps>(function T({ fontSize }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTermTerminal | null>(null)
  const termFitRef = useRef<FitAddon | null>(null)
  const [contextMenu, setContextMenu] = useState<TContextMenuState | null>(null)

  const backgroundColor = useToken("colors", "gray.900")
  const textColor = useToken("colors", "gray.100")

  const scrollBarThumbToken = useColorModeValue("gray.500", "gray.200")
  const scrollBarThumbColor = useToken("colors", scrollBarThumbToken)

  const contextMenuBackground = useColorModeValue("white", "gray.800")
  const contextMenuHover = useColorModeValue("gray.100", "gray.700")
  const contextMenuBorder = useColorModeValue("gray.200", "gray.600")

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - 8),
      y: Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_HEIGHT - 8),
      hasSelection: (terminalRef.current?.getSelection() ?? "").length > 0,
    })
  }, [])

  const copySelection = useCallback(async () => {
    const selection = terminalRef.current?.getSelection() ?? ""
    setContextMenu(null)
    if (selection.length === 0) {
      return
    }

    try {
      await writeText(selection)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (contextMenu === null) {
      return
    }

    const close = () => setContextMenu(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close()
      }
    }

    window.addEventListener("mousedown", close)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("blur", close)

    return () => {
      window.removeEventListener("mousedown", close)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("blur", close)
    }
  }, [contextMenu])

  const terminalTheme = useMemo<Partial<IXTermTheme>>(
    () => ({
      background: backgroundColor,
      foreground: textColor,
    }),
    [backgroundColor, textColor]
  )

  useLayoutEffect(() => {
    if (!exists(terminalRef.current)) {
      const terminal = new XTermTerminal({
        convertEol: true,
        scrollback: 25_000,
        theme: terminalTheme,
        cursorStyle: "underline",
        disableStdin: true,
        cursorBlink: false,
        fontSize: remToPx(fontSize),
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: "400",
        fontWeightBold: "700",
      })
      terminalRef.current = terminal

      terminal.onKey((key) => {
        if (terminal.hasSelection() && key.domEvent.ctrlKey && key.domEvent.key === "c") {
          document.execCommand("copy")
        }
      })

      const termFit = new FitAddon()
      termFitRef.current = termFit
      terminal.loadAddon(termFit)

      terminal.open(containerRef.current!)
      termFit.fit()

      // Clean up aaaall the things :)
      return () => {
        termFitRef.current?.dispose()
        termFitRef.current = null

        terminalRef.current?.dispose()
        terminalRef.current = null
      }
    }

    // Don't initialize more than once! Use imperative api to update terminal state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const resizeHandler = () => {
      try {
        termFitRef.current?.fit()
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("resize", resizeHandler, true)

    return () => window.removeEventListener("resize", resizeHandler, true)
  }, [])

  useEffect(() => {
    let maybeTheme = terminalRef.current?.options.theme
    if (exists(maybeTheme)) {
      maybeTheme = terminalTheme
    }
  }, [terminalTheme])

  useEffect(() => {
    // TODO: resize when global font size changes
    let maybeFontSize = terminalRef.current?.options.fontSize
    if (exists(maybeFontSize)) {
      maybeFontSize = remToPx(fontSize)
    }
  }, [fontSize])

  useImperativeHandle(
    ref,
    () => {
      return {
        clear() {
          terminalRef.current?.clear()
        },
        write(data) {
          terminalRef.current?.write(data)
          termFitRef.current?.fit()
        },
        writeln(data) {
          terminalRef.current?.writeln(data)
          termFitRef.current?.fit()
        },
      }
    },
    [terminalRef]
  )

  return (
    <Box width="full" height="full" onContextMenu={handleContextMenu}>
      <Box
        height="full"
        as="div"
        backgroundColor={terminalTheme.background}
        borderRadius="md"
        borderWidth={8}
        boxSizing="content-box" // needs to be set to accommodate for the way xterm measures it's container
        borderColor={terminalTheme.background}
        ref={containerRef}
        css={css`
          .xterm-viewport {
            &::-webkit-scrollbar-button {
              display: none;
              height: 13px;
              border-radius: 0px;
              background-color: transparent;
            }
            &::-webkit-scrollbar-button:hover {
              background-color: transparent;
            }
            &::-webkit-scrollbar-thumb {
              border-radius: 4px;
              background-color: ${scrollBarThumbColor};
            }
            &::-webkit-scrollbar-track {
              background-color: transparent;
            }
            &::-webkit-scrollbar-track:hover {
              background-color: transparent;
            }
            &::-webkit-scrollbar {
              width: 6px;
            }
          }
        `}
      />
      {contextMenu !== null && (
        <Portal>
          <Box
            position="fixed"
            top={`${contextMenu.y}px`}
            left={`${contextMenu.x}px`}
            zIndex="popover"
            minWidth="10rem"
            paddingY="1"
            backgroundColor={contextMenuBackground}
            borderColor={contextMenuBorder}
            borderWidth="1px"
            borderRadius="md"
            boxShadow="lg"
            onMouseDown={(event) => event.stopPropagation()}>
            <Box
              as="button"
              display="block"
              width="full"
              paddingX="3"
              paddingY="1.5"
              textAlign="left"
              fontSize="sm"
              userSelect="none"
              cursor={contextMenu.hasSelection ? "pointer" : "default"}
              color={contextMenu.hasSelection ? undefined : "gray.500"}
              _hover={contextMenu.hasSelection ? { backgroundColor: contextMenuHover } : undefined}
              onClick={() => void copySelection()}
              disabled={!contextMenu.hasSelection}>
              Copy
            </Box>
          </Box>
        </Portal>
      )}
    </Box>
  )
})
