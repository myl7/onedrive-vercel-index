import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken } from '.'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import searchIndex from '../../utils/searchIndex'

/**
 * Sanitize the search query
 *
 * @param query User search query, which may contain special characters
 * @returns Sanitised query string which replaces non-alphanumeric characters with ' '
 */
function sanitiseQuery(query: string): string {
  const sanitisedQuery = query.replace(/[^a-zA-Z0-9]/g, ' ')
  return encodeURIComponent(sanitisedQuery)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get access token from storage
  const accessToken = await getAccessToken()

  // Query parameter from request
  const { q: searchQuery = '' } = req.query

  if (typeof searchQuery === 'string') {
    // Construct Microsoft Graph Search API URL, and perform search only under the base directory
    const searchRootPath = encodePath('/')
    const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'

    const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${sanitiseQuery(searchQuery)}')`

    try {
      switch (siteConfig.searchProvider ?? 'od') {
        case 'od':
          const { data } = await axios.get(searchApi, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              select: 'id,name,file,folder,parentReference',
              top: siteConfig.maxItems
            }
          })
          res.status(200).json(data.value)
          return
        case 'lua':
          const ids = await searchIndex(searchQuery)
          const itemApi = (id: string) => `${apiConfig.driveApi}/items/${id}`
          const values = await Promise.all(
            ids.map(id =>
              axios.get(itemApi(id), {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                  select: 'id,name,file,folder,parentReference'
                }
              })
            )
          )
          res.status(200).json(values)
          return
        default:
          res.status(500).json({ error: 'Unknown search provider' })
          return
      }
    } catch (error: any) {
      res.status(error.response.status).json({ error: error.response.data })
    }
  } else {
    res.status(200).json([])
  }
  return
}
