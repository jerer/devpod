import { Button, Icon, useToast } from "@chakra-ui/react"
import { useMutation } from "@tanstack/react-query"
import { open } from "@tauri-apps/plugin-dialog"
import { HiOutlineUpload } from "react-icons/hi"
import { client } from "../../client"
import { devPodStore } from "../../contexts/DevPodContext/devPodStore"

export function ImportWorkspaceButton() {
  const toast = useToast()
  const { mutate: handleImportClicked, isLoading } = useMutation({
    mutationFn: async () => {
      const selectedFile = await open({
        title: "Import Workspace",
        filters: [{ name: "DevPod Workspace", extensions: ["json"] }],
        directory: false,
        multiple: false,
      })
      if (selectedFile === null) {
        return
      }

      const filePath = Array.isArray(selectedFile) ? selectedFile[0] : selectedFile
      if (!filePath) {
        return
      }

      ;(await client.workspaces.import(filePath)).unwrap()

      const workspaces = await client.workspaces.listAll()
      if (!workspaces.err) {
        devPodStore.setWorkspaces(workspaces.val)
      }

      toast({
        title: "Workspace imported",
        status: "success",
        duration: 5_000,
        isClosable: true,
      })
    },
    onError(error) {
      toast({
        title: `Failed to import workspace: ${error}`,
        status: "error",
        duration: 30_000,
        isClosable: true,
      })
    },
  })

  return (
    <Button
      size="sm"
      variant="outline"
      aria-label="Import workspace"
      leftIcon={<Icon as={HiOutlineUpload} boxSize={5} />}
      isLoading={isLoading}
      onClick={() => handleImportClicked()}>
      Import
    </Button>
  )
}
