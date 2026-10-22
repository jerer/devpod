import { CloseIcon } from "@chakra-ui/icons"
import { IconButton, Input, InputGroup, InputLeftAddon, InputRightElement } from "@chakra-ui/react"
import {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

type TClearableInputProps = Readonly<{
  defaultValue: string
  placeholder: string
  label?: ReactNode
  onChange: (newValue: string) => void | Promise<unknown>
}>
export function ClearableInput({
  defaultValue,
  placeholder,
  label,
  onChange,
}: TClearableInputProps) {
  const [value, setValue] = useState(defaultValue)
  const [hasFocus, setHasFocus] = useState(false)
  const hasFocusRef = useRef(false)
  const isDirtyRef = useRef(false)

  // keep the field in sync with the value that was loaded from the backend,
  // but never overwrite a value the user is currently editing
  useEffect(() => {
    if (hasFocusRef.current && isDirtyRef.current) return

    setValue(defaultValue)
  }, [defaultValue])

  const commit = useCallback(
    async (newValue: string) => {
      const trimmed = newValue.trim()
      setValue(trimmed)

      try {
        await onChange(trimmed)
      } catch {
        // the update failed, so restore the last value we know was persisted
        setValue((current) => (current === trimmed ? defaultValue : current))
      }
    },
    [defaultValue, onChange]
  )

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    isDirtyRef.current = true
    setValue(e.target.value)
  }, [])

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      hasFocusRef.current = false
      isDirtyRef.current = false
      void commit(e.target.value)
      setHasFocus(false)
    },
    [commit]
  )

  const handleKeyUp = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return

    e.currentTarget.blur()
  }, [])

  const handleFocus = useCallback(() => {
    hasFocusRef.current = true
    setHasFocus(true)
  }, [])

  const handleClearClicked = useCallback(() => {
    isDirtyRef.current = true
    setValue("")
    void commit("")
  }, [commit])

  return (
    <InputGroup maxWidth="96">
      {label && <InputLeftAddon>{label}</InputLeftAddon>}
      <Input
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyUp={handleKeyUp}
        onFocus={handleFocus}
      />
      <InputRightElement>
        <IconButton
          visibility={hasFocus ? "visible" : "hidden"}
          size="xs"
          borderRadius="full"
          icon={<CloseIcon />}
          aria-label="clear"
          onMouseDown={(e) => {
            // needed to prevent losing focus from input
            e.stopPropagation()
            e.preventDefault()
          }}
          onClick={handleClearClicked}
        />
      </InputRightElement>
    </InputGroup>
  )
}
