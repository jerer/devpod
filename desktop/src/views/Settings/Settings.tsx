import {
  Button,
  Checkbox,
  Code,
  Divider,
  FormLabel,
  Grid,
  HStack,
  Heading,
  Icon,
  Radio,
  RadioGroup,
  Select,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
  useColorMode,
  useColorModeValue,
} from "@chakra-ui/react"
import { ReactNode } from "react"
import { HiMagnifyingGlassPlus } from "react-icons/hi2"
import { client } from "../../client"
import { ToolbarTitle } from "../../components"
import { TSettings, useChangeSettings } from "../../contexts"
import { getIDEDisplayName, isMacOS } from "../../lib"
import { useWelcomeModal } from "../../useWelcomeModal"
import {
  useAgentURLOption,
  useDockerCredentialsForwardingOption,
  useGitCredentialsForwardingOption,
} from "./useContextOptions"
import { useIDESettings } from "./useIDESettings"
import {
  useCLIFlagsOption,
  useDotfilesOption,
  useExtraEnvVarsOption,
  useProxyOptions,
  useSSHKeySignatureOption,
} from "./useSettingsOptions"

const SETTINGS_TABS = [
  { label: "General", component: <GeneralSettings /> },
  { label: "Customization", component: <CustomizationSettings /> },
  { label: "Appearance", component: <AppearanceSettings /> },
  { label: "Experimental", component: <ExperimentalSettings /> },
]

export function Settings() {
  return (
    <>
      <ToolbarTitle>
        <Heading as="h3" size="sm">
          Settings
        </Heading>
      </ToolbarTitle>

      <Tabs isLazy isFitted variant="muted">
        <TabList marginBottom="6">
          {SETTINGS_TABS.map(({ label }) => (
            <Tab key={label}>{label}</Tab>
          ))}
        </TabList>
        <TabPanels>
          {SETTINGS_TABS.map(({ label, component }) => (
            <TabPanel key={label}>{component}</TabPanel>
          ))}
        </TabPanels>
      </Tabs>
    </>
  )
}

function GeneralSettings() {
  const { settings, set } = useChangeSettings()
  const { modal: welcomeModal, show: showWelcomeModal } = useWelcomeModal()
  const { input: agentURLInput, helpText: agentURLHelpText } = useAgentURLOption()
  const { input: proxyInput, helpText: proxyHelpText } = useProxyOptions()

  return (
    <>
      <SettingSection
        title="Debug mode"
        description={
          <>
            Run all DevPod commands with the <Code>--debug</Code> flag, making it easier to
            troubleshoot
          </>
        }>
        <Switch
          isChecked={settings.debugFlag}
          onChange={(e) => set("debugFlag", e.target.checked)}
        />
      </SettingSection>

      <SettingSection title="Agent URL" description={agentURLHelpText}>
        {agentURLInput}
      </SettingSection>

      <SettingSection title="Proxy Configuration" description={proxyHelpText}>
        {proxyInput}
      </SettingSection>

      <SettingSection
        showDivider={false}
        title="Show Intro"
        description="Show the introduction to DevPod again">
        <Button variant="outline" onClick={() => showWelcomeModal({ cancellable: true })}>
          Open
        </Button>
      </SettingSection>

      <VStack align="start" paddingTop="16" paddingBottom="8">
        <Heading size="sm" as="h4" color="red.600">
          Danger Zone
        </Heading>
        <Button variant="outline" colorScheme="red" onClick={() => client.quit()}>
          Quit DevPod
        </Button>
      </VStack>

      {welcomeModal}
    </>
  )
}

function CustomizationSettings() {
  const { input: dotfilesInput } = useDotfilesOption()
  const { input: gitSSHSignatureInput } = useSSHKeySignatureOption()
  const { settings, set } = useChangeSettings()
  const { ides, defaultIDE, updateDefaultIDE } = useIDESettings()
  const { input: dockerCredentialForwardingInput, helpText: dockerCredentialForwardingHelpText } =
    useDockerCredentialsForwardingOption()
  const { input: gitCredentialForwardingInput, helpText: gitCredentialForwardingHelpText } =
    useGitCredentialsForwardingOption()

  return (
    <>
      <SettingSection
        title="IDE"
        description="Select the default IDE you're using for workspaces. This will be overridden whenever you create a workspace with a different IDE. You can prevent this by checking the 'Always use this IDE' checkbox">
        <>
          <Select
            maxWidth="52"
            textTransform="capitalize"
            onChange={(e) => updateDefaultIDE({ ide: e.target.value })}
            value={defaultIDE ? defaultIDE.name! : undefined}>
            {ides?.map((ide) => (
              <option key={ide.name} value={ide.name!}>
                {getIDEDisplayName(ide)}
              </option>
            ))}
          </Select>
          <Checkbox
            isChecked={settings.fixedIDE}
            onChange={(e) => set("fixedIDE", e.target.checked)}>
            Always use this IDE
          </Checkbox>
        </>
      </SettingSection>

      <SettingSection
        title="Dotfiles"
        description="Set the dotfiles git repository to use inside workspaces">
        {dotfilesInput}
      </SettingSection>

      <SettingSection
        title="SSH Key for Git commit signing"
        description="Set path of your SSH key you want to use for signing Git commits">
        {gitSSHSignatureInput}
      </SettingSection>

      <SettingSection
        title="Docker credentials forwarding"
        description={dockerCredentialForwardingHelpText}>
        {dockerCredentialForwardingInput}
      </SettingSection>

      <SettingSection
        showDivider={false}
        title="Git credentials forwarding"
        description={gitCredentialForwardingHelpText}>
        {gitCredentialForwardingInput}
      </SettingSection>
    </>
  )
}

function AppearanceSettings() {
  const { settings, set } = useChangeSettings()

  return (
    <>
      {isMacOS && (
        <SettingSection
          title="Translucent UI"
          description="Use transparency in the sidebar and other UI elements">
          <Switch
            isChecked={settings.transparency}
            onChange={(e) => set("transparency", e.target.checked)}
          />
        </SettingSection>
      )}

      <SettingSection title="Zoom level" description="Adjust the zoom level">
        <HStack>
          <Select
            onChange={(e) => set("zoom", e.target.value as TSettings["zoom"])}
            value={settings.zoom}>
            <option value={"sm"}>Small</option>
            <option value={"md"}>Regular</option>
            <option value={"lg"}>Large</option>
            <option value={"xl"}>Extra Large</option>
          </Select>
          <Icon as={HiMagnifyingGlassPlus} boxSize="6" color="gray.600" />
        </HStack>
      </SettingSection>

      <SettingSection showDivider={false} title="Sidebar position" description="">
        <RadioGroup
          value={settings.sidebarPosition}
          onChange={(newValue: TSettings["sidebarPosition"]) => set("sidebarPosition", newValue)}>
          <HStack>
            <Radio value="left">Left</Radio>
            <Radio value="right">Right</Radio>
          </HStack>
        </RadioGroup>
      </SettingSection>
    </>
  )
}
function ExperimentalSettings() {
  const { input: cliFlagsInput, helpText: cliFlagsHelpText } = useCLIFlagsOption()
  const { input: extraEnvVarsInput, helpText: extraEnvVarsHelpText } = useExtraEnvVarsOption()
  const { settings, set } = useChangeSettings()
  const { setColorMode } = useColorMode()

  return (
    <VStack align="start">
      <SettingSection
        title="Multiple devcontainer detection"
        description="Whenever new workspaces are created, check if there are multiple devcontainers in the source. This might take a while for larger repositories">
        <Switch
          id="multicontainer"
          isChecked={settings.experimental_multiDevcontainer}
          onChange={(e) => set("experimental_multiDevcontainer", e.target.checked)}
        />
      </SettingSection>

      <SettingSection
        title="Experimental IDEs"
        description=" Enable experimental IDEs. These IDEs are not officially supported by DevPod and might be unstable. We are working on making them generally available">
        <HStack>
          <Switch
            isChecked={settings.experimental_fleet}
            onChange={(e) => set("experimental_fleet", e.target.checked)}
          />
          <FormLabel marginBottom="0" whiteSpace="nowrap" fontSize="sm">
            JetBrains Fleet
          </FormLabel>
        </HStack>
        <HStack width="full" align="center">
          <Switch
            isChecked={settings.experimental_jupyterNotebooks}
            onChange={(e) => set("experimental_jupyterNotebooks", e.target.checked)}
          />
          <FormLabel marginBottom="0" whiteSpace="nowrap" fontSize="sm">
            Jupyter Notebooks
          </FormLabel>
        </HStack>
        <HStack width="full" align="center">
          <Switch
            isChecked={settings.experimental_vscodeInsiders}
            onChange={(e) => set("experimental_vscodeInsiders", e.target.checked)}
          />
          <FormLabel marginBottom="0" whiteSpace="nowrap" fontSize="sm">
            VSCode Insiders
          </FormLabel>
        </HStack>
        <HStack width="full" align="center">
          <Switch
            isChecked={settings.experimental_cursor}
            onChange={(e) => set("experimental_cursor", e.target.checked)}
          />
          <FormLabel marginBottom="0" whiteSpace="nowrap" fontSize="sm">
            Cursor
          </FormLabel>
        </HStack>
        <HStack width="full" align="center">
          <Switch
            isChecked={settings.experimental_positron}
            onChange={(e) => set("experimental_positron", e.target.checked)}
          />
          <FormLabel marginBottom="0" whiteSpace="nowrap" fontSize="sm">
            Positron
          </FormLabel>
        </HStack>
      </SettingSection>

      <SettingSection title="Additional CLI Flags" description={cliFlagsHelpText}>
        {cliFlagsInput}
      </SettingSection>

      <SettingSection title="Additional Environment Variables" description={extraEnvVarsHelpText}>
        {extraEnvVarsInput}
      </SettingSection>

      <SettingSection title="Color Mode" description="" showDivider={false}>
        <RadioGroup
          value={settings.experimental_colorMode}
          onChange={(newValue: TSettings["experimental_colorMode"]) => {
            set("experimental_colorMode", newValue)
            setColorMode(newValue)
          }}>
          <HStack>
            <Radio value="light">Light</Radio>
            <Radio value="dark">Dark</Radio>
          </HStack>
        </RadioGroup>
      </SettingSection>
    </VStack>
  )
}

type TSettingDescriptionProps = Readonly<{ children: ReactNode }>
function SettingDescription({ children }: TSettingDescriptionProps) {
  const descriptionColor = useColorModeValue("gray.500", "gray.400")

  return (
    <Text color={descriptionColor} fontSize="sm">
      {children}
    </Text>
  )
}

type TSettingSectionProps = Readonly<{
  title: string
  description: ReactNode
  showDivider?: boolean
  children: ReactNode
}>
function SettingSection({
  title,
  description,
  showDivider = true,
  children,
}: TSettingSectionProps) {
  return (
    <>
      <Grid gridTemplateColumns="32rem 1fr" columnGap="20" width="full">
        <VStack align="start" gap="0">
          <Heading as="h4" size="sm" fontWeight="medium">
            {title}
          </Heading>
          <SettingDescription>{description}</SettingDescription>
        </VStack>

        <VStack align="start" paddingX="2" width="full" overflow="hidden">
          {children}
        </VStack>
      </Grid>
      {showDivider && <SettingDivider />}
    </>
  )
}

function SettingDivider() {
  return <Divider marginY="4" />
}
