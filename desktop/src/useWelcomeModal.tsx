import {
  Heading,
  HStack,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalOverlay,
  Text,
  useDisclosure,
  VStack,
} from "@chakra-ui/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { client } from "./client"
import { LoftOSSBadge, Step, Steps } from "./components"
import { Briefcase, DevpodWordmark } from "./icons"
import { Routes } from "./routes"

const IS_FIRST_VISIT_KEY = "devpod-is-first-visit"

export function useWelcomeModal() {
  const navigate = useNavigate()
  const { isOpen, onClose, onOpen } = useDisclosure()
  const [isCancellable, setIsCancellable] = useState(false)
  const handleSetupFinished = useCallback(() => {
    onClose()
    navigate(Routes.WORKSPACE_CREATE)
  }, [navigate, onClose])

  // Open the welcome modal on first visit
  useEffect(() => {
    const maybeFirstVisit = localStorage.getItem(IS_FIRST_VISIT_KEY)
    const shouldShowWelcomeModal = maybeFirstVisit === null && !isOpen

    if (shouldShowWelcomeModal) {
      onOpen()
      localStorage.setItem(IS_FIRST_VISIT_KEY, "false")
    }
  }, [isOpen, onOpen])

  const modal = useMemo(() => {
    return (
      <Modal
        onClose={onClose}
        isOpen={isOpen}
        isCentered
        size="4xl"
        scrollBehavior="inside"
        closeOnEsc={isCancellable}
        closeOnOverlayClick={isCancellable}>
        <ModalOverlay />
        <ModalContent>
          {isCancellable && <ModalCloseButton />}
          <ModalBody>
            <VStack align="start" spacing="8" paddingX="4" paddingTop="4">
              <Steps finishText="Get Started" onFinish={handleSetupFinished}>
                <Step>
                  <HStack width="full" justifyContent="space-between" alignItems="center">
                    <HStack>
                      <Heading as="h1" size="lg" marginRight="2">
                        Welcome to
                      </Heading>
                      <DevpodWordmark width="40" height="16" />
                    </HStack>
                    <LoftOSSBadge />
                  </HStack>

                  <Text fontWeight="bold">
                    DevPod is a tool to create reproducible developer environments.
                  </Text>
                  <Text>
                    Each developer environment runs in a separate container and is specified through
                    a devcontainer.json. Through DevPod providers these containers can be created on
                    the local computer, any reachable remote machine or in a public or private
                    cloud. It&apos;s also possible to extend DevPod and write your own custom
                    providers. <br />
                    For more information, head over to our{" "}
                    <Link color="primary.600" onClick={() => client.open("https://devpod.sh/docs")}>
                      documentation.
                    </Link>
                  </Text>

                  <Text fontWeight="bold">Let&apos;s set you up!</Text>
                </Step>

                <Step>
                  <HStack>
                    <Briefcase boxSize="6" />
                    <Heading as="h1" size="lg" marginRight="2">
                      Workspaces
                    </Heading>
                  </HStack>

                  <Text>
                    Workspaces are your reproducible development environment on a per-project basis.
                    Turn a local folder, git repository or docker container into a workspace and
                    connect it to your favorite coding tool. Or just ssh into them and go crazy.
                  </Text>
                </Step>
              </Steps>
            </VStack>
          </ModalBody>
          <ModalFooter />
        </ModalContent>
      </Modal>
    )
  }, [handleSetupFinished, isCancellable, isOpen, onClose])

  const show = useCallback(
    ({ cancellable = false }: Readonly<{ cancellable?: boolean }>) => {
      setIsCancellable(cancellable)
      onOpen()
    },
    [onOpen]
  )

  return { modal, show }
}
