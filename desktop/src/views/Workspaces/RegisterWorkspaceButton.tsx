import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react"
import { useMutation } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { client } from "../../client"
import { useProviders } from "../../contexts"
import { devPodStore } from "../../contexts/DevPodContext/devPodStore"
import { TProvider } from "../../types"

function getProviderNamespace(provider: TProvider | undefined): string {
  return (
    provider?.state?.options?.KUBERNETES_NAMESPACE?.value ??
    provider?.config?.options?.KUBERNETES_NAMESPACE?.default ??
    ""
  )
}

export function RegisterWorkspaceButton() {
  const toast = useToast()
  const [[providers]] = useProviders()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [podName, setPodName] = useState("")
  const [namespace, setNamespace] = useState("")
  const [workspaceID, setWorkspaceID] = useState("")
  const [providerID, setProviderID] = useState("")
  const [gitURL, setGitURL] = useState("")
  const [gitBranch, setGitBranch] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])
  const [isChecking, setIsChecking] = useState(false)

  const kubernetesProviders = useMemo(
    () =>
      Object.entries(providers ?? {}).filter(
        ([id, provider]) =>
          provider.config?.name === "kubernetes" || id.toLowerCase().includes("kubernetes")
      ),
    [providers]
  )

  const { mutate: handleRegister, isLoading } = useMutation({
    mutationFn: async (force: boolean) => {
      if (!providerID) {
        throw new Error("No Kubernetes provider configured")
      }
      if (!podName.trim()) {
        throw new Error("Pod name is required")
      }

      ;(
        await client.workspaces.register(
          podName.trim(),
          namespace.trim(),
          providerID,
          workspaceID.trim(),
          gitURL.trim(),
          gitBranch.trim(),
          force
        )
      ).unwrap()

      const workspaces = await client.workspaces.listAll()
      if (!workspaces.err) {
        devPodStore.setWorkspaces(workspaces.val)
      }

      toast({
        title: "Workspace registered",
        status: "success",
        duration: 5_000,
        isClosable: true,
      })
      onClose()
    },
    onError(error) {
      toast({
        title: `Failed to register workspace: ${error}`,
        status: "error",
        duration: 30_000,
        isClosable: true,
      })
    },
  })

  const handleSubmit = async () => {
    setWarnings([])

    if (!providerID) {
      toast({
        title: "Failed to register workspace: No Kubernetes provider configured",
        status: "error",
        duration: 10_000,
        isClosable: true,
      })
      return
    }
    if (!podName.trim()) {
      toast({
        title: "Failed to register workspace: Pod name is required",
        status: "error",
        duration: 10_000,
        isClosable: true,
      })
      return
    }

    setIsChecking(true)
    const result = await client.workspaces.checkRegister(
      podName.trim(),
      namespace.trim(),
      providerID,
      workspaceID.trim(),
      gitURL.trim(),
      gitBranch.trim()
    )
    setIsChecking(false)

    if (result.err) {
      toast({
        title: result.val.message,
        status: "error",
        duration: 30_000,
        isClosable: true,
      })
      return
    }

    if (result.val.configDiffers) {
      setWarnings(
        result.val.warnings && result.val.warnings.length > 0
          ? [...result.val.warnings]
          : [
              "The pod was created with a different configuration and its container will be recreated on the next start.",
            ]
      )
      return
    }

    handleRegister(false)
  }

  const handleOpen = () => {
    const defaultProvider =
      kubernetesProviders.find(([, provider]) => provider.default)?.[0] ??
      kubernetesProviders[0]?.[0] ??
      ""
    setPodName("")
    setWorkspaceID("")
    setGitURL("")
    setGitBranch("")
    setWarnings([])
    setProviderID(defaultProvider)
    setNamespace(getProviderNamespace(providers?.[defaultProvider]))
    onOpen()
  }

  const handleProviderChange = (id: string) => {
    setProviderID(id)
    setNamespace(getProviderNamespace(providers?.[id]))
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        aria-label="Register existing Kubernetes workspace"
        onClick={handleOpen}>
        Register
      </Button>

      <Modal onClose={onClose} isOpen={isOpen} isCentered>
        <ModalOverlay />
        <ModalContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleSubmit()
            }}>
            <ModalHeader>Register existing Kubernetes workspace</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing="4" alignItems="start">
                <Text fontSize="sm" color="gray.500">
                  Register a running DevPod workspace pod that was created by the Kubernetes
                  provider.
                </Text>

                {kubernetesProviders.length === 0 ? (
                  <Text color="red.500" fontSize="sm">
                    No Kubernetes provider is configured. Add one before registering a workspace.
                  </Text>
                ) : (
                  <FormControl isRequired>
                    <FormLabel>Provider</FormLabel>
                    <Select
                      value={providerID}
                      onChange={(event) => handleProviderChange(event.target.value)}>
                      {kubernetesProviders.map(([id]) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}

                <FormControl isRequired>
                  <FormLabel>Pod name</FormLabel>
                  <Input
                    value={podName}
                    placeholder="devpod-<workspace-uid>"
                    onChange={(event) => setPodName(event.target.value)}
                  />
                  <FormHelperText>
                    The pod must have been created by the Kubernetes provider and be named
                    devpod-&lt;workspace-uid&gt;.
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Workspace ID</FormLabel>
                  <Input
                    value={workspaceID}
                    placeholder="<workspace-id>"
                    onChange={(event) => setWorkspaceID(event.target.value)}
                  />
                  <FormHelperText>
                    Optional. Overrides the workspace ID derived from the pod. Use this if a
                    workspace with the derived ID already exists locally.
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Namespace</FormLabel>
                  <Input
                    value={namespace}
                    placeholder="devpod"
                    onChange={(event) => setNamespace(event.target.value)}
                  />
                  <FormHelperText>
                    Prefilled from the provider configuration. Override it if the pod lives in a
                    different namespace.
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Git repository</FormLabel>
                  <Input
                    value={gitURL}
                    placeholder="https://github.com/org/repo"
                    onChange={(event) => setGitURL(event.target.value)}
                  />
                  <FormHelperText>
                    Optional. DevPod reads devcontainer.json from this repository during
                    registration.
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Git branch</FormLabel>
                  <Input
                    value={gitBranch}
                    placeholder="main"
                    onChange={(event) => setGitBranch(event.target.value)}
                  />
                  <FormHelperText>
                    Optional. Defaults to the repository's default branch.
                  </FormHelperText>
                </FormControl>

                {warnings.length > 0 && (
                  <Box
                    width="full"
                    borderWidth="1px"
                    borderColor="orange.400"
                    backgroundColor="orange.50"
                    borderRadius="md"
                    padding="3">
                    <Text fontWeight="semibold" color="orange.700" marginBottom="1">
                      Container will be recreated
                    </Text>
                    <Text fontSize="sm" color="orange.700" whiteSpace="pre-line">
                      {warnings.join("\n")}
                    </Text>
                  </Box>
                )}
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" marginRight="2" onClick={onClose}>
                Cancel
              </Button>
              {warnings.length > 0 ? (
                <Button
                  variant="primary"
                  isLoading={isLoading}
                  onClick={() => handleRegister(true)}>
                  Register anyway
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isChecking || isLoading}
                  isDisabled={kubernetesProviders.length === 0 || !podName.trim()}>
                  Register
                </Button>
              )}
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </>
  )
}
