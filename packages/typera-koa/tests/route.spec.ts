import * as t from 'io-ts'
import { Middleware, Parser, Response, Route, URL, router, route } from '..'
import * as request from 'supertest'
import { makeServer } from './utils'

describe('route & router', () => {
  let server: ReturnType<typeof makeServer> | null = null

  afterEach(() => {
    if (server) {
      server.close()
      server = null
    }
  })

  it('works', async () => {
    const foo: Route<Response.Ok<string>> = route.get('/foo')()(_ => {
      return Response.ok('foo')
    })
    server = makeServer(router(foo).handler())

    await request(server)
      .get('/foo')
      .expect(200)
  })

  it('supports adding multiple routes', async () => {
    const foo: Route<Response.Ok<string>> = route.get('/foo')()(_ => {
      return Response.ok('foo')
    })
    const bar: Route<Response.Ok<string>> = route.get('/bar')()<
      Response.Ok<string>
    >(_ => {
      return Response.ok('bar')
    })
    const baz: Route<Response.Ok<string>> = route.get('/baz')()<
      Response.Ok<string>
    >(_ => {
      return Response.ok('baz')
    })
    const quux: Route<Response.Ok<string>> = route.get('/quux')()<
      Response.Ok<string>
    >(_ => {
      return Response.ok('quux')
    })

    const handler = router(foo, bar)
      .add(baz, quux)
      .handler()
    server = makeServer(handler)

    await request(server)
      .get('/foo')
      .expect(200, 'foo')
    await request(server)
      .get('/bar')
      .expect(200, 'bar')
    await request(server)
      .get('/baz')
      .expect(200, 'baz')
    await request(server)
      .get('/quux')
      .expect(200, 'quux')
  })

  it('decodes the request', async () => {
    const decode: Route<
      Response.NoContent | Response.BadRequest<string>
    > = route.post('/decode/', URL.str('foo'))(
      Parser.query(t.type({ bar: t.string })),
      Parser.body(t.type({ baz: t.number }))
    )(request => {
      expect(request.routeParams).toEqual({ foo: 'FOO' })
      expect(request.query).toEqual({ bar: 'BAR' })
      expect(request.body).toEqual({ baz: 42 })
      return Response.noContent()
    })

    const handler = router(decode).handler()
    server = makeServer(handler)

    await request(server)
      .post('/decode/FOO?bar=BAR')
      .send({ baz: 42 })
      .expect(204)
  })

  it('returns errors from middleware', async () => {
    const error: Route<
      Response.NoContent | Response.BadRequest<string>
    > = route.post('/error')(Parser.body(t.type({ foo: t.number })))(
      _request => {
        return Response.noContent()
      }
    )
    const handler = router(error).handler()
    server = makeServer(handler)

    await request(server)
      .post('/error')
      .send({ foo: 'bar' })
      .expect(
        400,
        'Invalid body: Invalid value "bar" supplied to : { foo: number }/foo: number'
      )
  })

  it('runs middleware finalizers', async () => {
    let middleware1 = 0
    let finalizer1 = 0
    const mw1: Middleware.Middleware<{}, never> = () => {
      middleware1++
      return Middleware.next({}, () => {
        finalizer1++
      })
    }

    let middleware2 = 0
    let finalizer2 = 0
    const mw2: Middleware.Middleware<{}, never> = () => {
      middleware2++
      return Middleware.next({}, () => {
        finalizer2++
      })
    }

    const root: Route<Response.Ok> = route.get('/')(mw1, mw2)(_request => {
      return Response.ok()
    })
    const handler = router(root).handler()
    server = makeServer(handler)

    await request(server)
      .get('/')
      .expect(200)

    expect(middleware1).toEqual(1)
    expect(finalizer1).toEqual(1)
    expect(middleware2).toEqual(1)
    expect(finalizer2).toEqual(1)
  })

  it('runs previous middleware finalizers when a middleware returns a response', async () => {
    let middleware1 = 0
    let finalizer1 = 0
    const mw1: Middleware.Middleware<{}, never> = () => {
      middleware1++
      return Middleware.next({}, () => {
        finalizer1++
      })
    }

    let middleware2 = 0
    const mw2: Middleware.Middleware<{}, Response.Unauthorized> = () => {
      middleware2++
      return Middleware.stop(Response.unauthorized())
    }

    const root: Route<Response.Ok | Response.Unauthorized> = route.get('/')(
      mw1,
      mw2
    )(_request => {
      return Response.ok()
    })
    const handler = router(root).handler()
    server = makeServer(handler)

    await request(server)
      .get('/')
      .expect(401)

    expect(middleware1).toEqual(1)
    expect(finalizer1).toEqual(1)
    expect(middleware2).toEqual(1)
  })

  it('ignores exceptions from middleware finalizers', async () => {
    let middleware1 = 0
    let finalizer1 = 0
    const mw1: Middleware.Middleware<{}, never> = () => {
      middleware1++
      return Middleware.next({}, () => {
        finalizer1++
        throw new Error('This exception should be ignored')
      })
    }

    let middleware2 = 0
    let finalizer2 = 0
    const mw2: Middleware.Middleware<{}, never> = () => {
      middleware2++
      return Middleware.next({}, () => {
        finalizer2++
      })
    }

    const root: Route<Response.Ok> = route.get('/')(mw1, mw2)(_request => {
      return Response.ok()
    })
    const handler = router(root).handler()
    server = makeServer(handler)

    await request(server)
      .get('/')
      .expect(200)

    expect(middleware1).toEqual(1)
    expect(finalizer1).toEqual(1)
    expect(middleware2).toEqual(1)
    expect(finalizer2).toEqual(1)
  })
})
